use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub enum Owner {
    Driver(String),
    Unassigned,
}

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

fn ensure_call_open(tx: &Transaction, call_id: &str) -> Result<()> {
    let outcome: Option<String> = tx
        .query_row(
            "SELECT outcome FROM calls WHERE id = ?1",
            [call_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();

    if outcome.is_none() {
        let exists: i64 = tx.query_row(
            "SELECT COUNT(1) FROM calls WHERE id = ?1",
            [call_id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            anyhow::bail!("Call not found");
        }
    }

    let outcome_val: Option<String> = tx.query_row(
        "SELECT outcome FROM calls WHERE id = ?1",
        [call_id],
        |r| r.get::<_, Option<String>>(0),
    )?;
    if outcome_val.is_some() {
        anyhow::bail!("Call is closed; cannot modify assignments");
    }
    Ok(())
}

fn ensure_not_active_assignment(tx: &Transaction, call_id: &str) -> Result<()> {
    let active: i64 = tx.query_row(
        "SELECT COUNT(1) FROM call_assignments WHERE call_id = ?1 AND state = 'ACTIVE'",
        [call_id],
        |r| r.get(0),
    )?;
    if active > 0 {
        anyhow::bail!("Call is ACTIVE; queue drag/drop is not allowed (use a dedicated action)");
    }
    Ok(())
}

fn fetch_queue(tx: &Transaction, driver_id: &str) -> Result<Vec<String>> {
    let mut stmt = tx.prepare(
        r#"
        SELECT call_id
        FROM call_assignments
        WHERE driver_id = ?1 AND state = 'QUEUED'
        ORDER BY
          CASE WHEN manual_sort_key IS NULL THEN 1 ELSE 0 END,
          manual_sort_key ASC,
          queue_position ASC
        "#,
    )?;
    let rows = stmt.query_map([driver_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

fn rewrite_queue_manual_mode(
    tx: &Transaction,
    driver_id: &str,
    ordered_call_ids: &[String],
) -> Result<()> {
    for (idx, cid) in ordered_call_ids.iter().enumerate() {
        let pos = (idx as i32) + 1;
        tx.execute(
            r#"
            UPDATE call_assignments
            SET queue_position = ?1,
                manual_sort_key = ?2
            WHERE driver_id = ?3
              AND state = 'QUEUED'
              AND call_id = ?4
            "#,
            params![pos, pos as f64, driver_id, cid],
        )?;
    }
    Ok(())
}

fn normalize_queue_after_removal(tx: &Transaction, driver_id: &str) -> Result<()> {
    let manual_count: i64 = tx.query_row(
        "SELECT COUNT(1) FROM call_assignments WHERE driver_id = ?1 AND state='QUEUED' AND manual_sort_key IS NOT NULL",
        [driver_id],
        |r| r.get(0),
    )?;

    let q = fetch_queue(tx, driver_id)?;
    if manual_count > 0 {
        rewrite_queue_manual_mode(tx, driver_id, &q)?;
    } else {
        for (idx, cid) in q.iter().enumerate() {
            let pos = (idx as i32) + 1;
            tx.execute(
                r#"
                UPDATE call_assignments
                SET queue_position = ?1
                WHERE driver_id = ?2 AND state='QUEUED' AND call_id = ?3
                "#,
                params![pos, driver_id, cid],
            )?;
        }
    }
    Ok(())
}

fn event_append_call(tx: &Transaction, call_id: &str, event_type: &str, metadata_json: Option<String>) -> Result<()> {
    tx.execute(
        r#"
        INSERT INTO events (id, timestamp, entity_type, entity_id, event_type, metadata_json)
        VALUES (?1, ?2, 'CALL', ?3, ?4, ?5)
        "#,
        params![uuid(), now(), call_id, event_type, metadata_json],
    )?;
    Ok(())
}

pub fn call_queue_add(
    conn: &mut Connection,
    call_id: &str,
    driver_id: &str,
    position: Option<i32>,
) -> Result<()> {
    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    ensure_call_open(&tx, call_id)?;
    ensure_not_active_assignment(&tx, call_id)?;

    let current: i64 = tx.query_row(
        "SELECT COUNT(1) FROM call_assignments WHERE call_id = ?1 AND state IN ('QUEUED','ACTIVE')",
        [call_id],
        |r| r.get(0),
    )?;
    if current > 0 {
        anyhow::bail!("Call already assigned (queued/active)");
    }

    let max_pos: i32 = tx.query_row(
        "SELECT COALESCE(MAX(queue_position), 0) FROM call_assignments WHERE driver_id=?1 AND state='QUEUED'",
        [driver_id],
        |r| r.get(0),
    )?;

    let insert_pos = position.unwrap_or(max_pos + 1).clamp(1, max_pos + 1);

    if insert_pos <= max_pos {
        tx.execute(
            r#"
            UPDATE call_assignments
            SET queue_position = queue_position + 1
            WHERE driver_id = ?1
              AND state = 'QUEUED'
              AND queue_position >= ?2
            "#,
            params![driver_id, insert_pos],
        )?;
    }

    let assignment_id = uuid();
    tx.execute(
        r#"
        INSERT INTO call_assignments (
          id, call_id, driver_id,
          state, queue_position, manual_sort_key,
          assigned_at, activated_at, ended_at
        ) VALUES (?1, ?2, ?3, 'QUEUED', ?4, NULL, ?5, NULL, NULL)
        "#,
        params![assignment_id, call_id, driver_id, insert_pos, ts],
    )
    .context("insert call_assignments queued failed")?;

    event_append_call(
        &tx,
        call_id,
        "CALL_ASSIGNED",
        Some(format!(r#"{{"to_driver":"{driver_id}","position":{insert_pos}}}"#)),
    )?;

    tx.commit().context("commit failed")?;
    Ok(())
}

pub fn call_queue_move(
    conn: &mut Connection,
    call_id: &str,
    from: Owner,
    to: Owner,
    new_position: i32,
) -> Result<()> {
    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    ensure_call_open(&tx, call_id)?;
    ensure_not_active_assignment(&tx, call_id)?;

    match (from, to) {
        (Owner::Driver(from_driver), Owner::Driver(to_driver)) => {
            let ended = tx.execute(
                r#"
                UPDATE call_assignments
                SET state='ENDED', ended_at=?1, queue_position=NULL, manual_sort_key=NULL
                WHERE call_id=?2 AND driver_id=?3 AND state='QUEUED'
                "#,
                params![ts, call_id, from_driver],
            )?;
            if ended == 0 {
                anyhow::bail!("Call is not queued on from_driver");
            }

            let assignment_id = uuid();
            tx.execute(
                r#"
                INSERT INTO call_assignments (
                  id, call_id, driver_id,
                  state, queue_position, manual_sort_key,
                  assigned_at, activated_at, ended_at
                ) VALUES (?1, ?2, ?3, 'QUEUED', 999999, NULL, ?4, NULL, NULL)
                "#,
                params![assignment_id, call_id, to_driver, ts],
            )
            .context("insert queued assignment on to_driver failed")?;

            let mut to_q = fetch_queue(&tx, &to_driver)?;
            to_q.retain(|cid| cid != call_id);
            let insert_at = (new_position.max(1) as usize)
                .saturating_sub(1)
                .min(to_q.len());
            to_q.insert(insert_at, call_id.to_string());

            rewrite_queue_manual_mode(&tx, &to_driver, &to_q)?;

            normalize_queue_after_removal(&tx, &from_driver)?;

            event_append_call(
                &tx,
                call_id,
                "CALL_QUEUE_MOVED",
                Some(format!(
                    r#"{{"from_driver":"{from_driver}","to_driver":"{to_driver}","new_position":{new_position}}}"#
                )),
            )?;
        }

        (Owner::Unassigned, Owner::Driver(to_driver)) => {
            let assignment_id = uuid();
            tx.execute(
                r#"
                INSERT INTO call_assignments (
                  id, call_id, driver_id,
                  state, queue_position, manual_sort_key,
                  assigned_at, activated_at, ended_at
                ) VALUES (?1, ?2, ?3, 'QUEUED', 999999, NULL, ?4, NULL, NULL)
                "#,
                params![assignment_id, call_id, to_driver, ts],
            )
            .context("insert queued assignment from unassigned failed")?;

            let mut to_q = fetch_queue(&tx, &to_driver)?;
            to_q.retain(|cid| cid != call_id);
            let insert_at = (new_position.max(1) as usize)
                .saturating_sub(1)
                .min(to_q.len());
            to_q.insert(insert_at, call_id.to_string());

            rewrite_queue_manual_mode(&tx, &to_driver, &to_q)?;

            event_append_call(
                &tx,
                call_id,
                "CALL_ASSIGNED",
                Some(format!(r#"{{"to_driver":"{to_driver}","new_position":{new_position}}}"#)),
            )?;
        }

        (Owner::Driver(from_driver), Owner::Unassigned) => {
            let ended = tx.execute(
                r#"
                UPDATE call_assignments
                SET state='ENDED', ended_at=?1, queue_position=NULL, manual_sort_key=NULL
                WHERE call_id=?2 AND driver_id=?3 AND state='QUEUED'
                "#,
                params![ts, call_id, from_driver],
            )?;
            if ended == 0 {
                anyhow::bail!("Call is not queued on from_driver");
            }

            normalize_queue_after_removal(&tx, &from_driver)?;

            event_append_call(
                &tx,
                call_id,
                "CALL_UNASSIGNED",
                Some(format!(r#"{{"from_driver":"{from_driver}"}}"#)),
            )?;
        }

        (Owner::Unassigned, Owner::Unassigned) => {}
    }

    tx.commit().context("commit failed")?;
    Ok(())
}

pub fn call_activate(conn: &mut Connection, call_id: &str, driver_id: &str) -> Result<()> {
    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    ensure_call_open(&tx, call_id)?;

    let updated = tx.execute(
        r#"
        UPDATE call_assignments
        SET state='ACTIVE', queue_position=NULL, activated_at=?1
        WHERE call_id=?2 AND driver_id=?3 AND state='QUEUED'
        "#,
        params![ts, call_id, driver_id],
    )?;

    if updated == 0 {
        anyhow::bail!("Call is not queued for that driver OR driver already has an active call");
    }

    tx.execute(
        r#"
        UPDATE calls
        SET status='ACTIVE', status_updated_at=?1, updated_at=?1
        WHERE id=?2
        "#,
        params![ts, call_id],
    )?;

    event_append_call(
        &tx,
        call_id,
        "CALL_STATUS_CHANGED",
        Some(r#"{"to":"ACTIVE"}"#.to_string()),
    )?;

    tx.commit().context("commit failed")?;

    if let Err(err) = crate::db::nearby_repo::update_driver_last_location_from_call(
        conn,
        driver_id,
        call_id,
        "ACTIVE_DROPOFF",
    ) {
        eprintln!("update_driver_last_location_from_call failed: {err}");
    }
    Ok(())
}

pub fn call_unassign(conn: &mut Connection, call_id: &str) -> Result<()> {
    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    ensure_call_open(&tx, call_id)?;
    ensure_not_active_assignment(&tx, call_id)?;

    let ended = tx.execute(
        r#"
        UPDATE call_assignments
        SET state='ENDED', ended_at=?1, queue_position=NULL, manual_sort_key=NULL
        WHERE call_id=?2 AND state='QUEUED'
        "#,
        params![ts, call_id],
    )?;

    if ended == 0 {
        anyhow::bail!("Call is not queued");
    }

    event_append_call(&tx, call_id, "CALL_UNASSIGNED", None)?;

    tx.commit().context("commit failed")?;
    Ok(())
}

pub fn call_active_reassign(
    conn: &mut Connection,
    call_id: &str,
    from_driver_id: &str,
    to_driver_id: Option<&str>,
) -> Result<()> {
    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    ensure_call_open(&tx, call_id)?;

    let active = tx.execute(
        r#"
        UPDATE call_assignments
        SET state='ENDED', ended_at=?1
        WHERE call_id=?2 AND driver_id=?3 AND state='ACTIVE'
        "#,
        params![ts, call_id, from_driver_id],
    )?;
    if active == 0 {
        anyhow::bail!("Call is not ACTIVE for that driver");
    }

    if let Some(to_driver) = to_driver_id {
        let existing_active: i64 = tx.query_row(
            "SELECT COUNT(1) FROM call_assignments WHERE driver_id = ?1 AND state = 'ACTIVE'",
            [to_driver],
            |r| r.get(0),
        )?;

        if existing_active > 0 {
            let assignment_id = uuid();
            tx.execute(
                r#"
                INSERT INTO call_assignments (
                  id, call_id, driver_id,
                  state, queue_position, manual_sort_key,
                  assigned_at, activated_at, ended_at
                ) VALUES (?1, ?2, ?3, 'QUEUED', 999999, NULL, ?4, NULL, NULL)
                "#,
                params![assignment_id, call_id, to_driver, ts],
            )
            .context("insert queued assignment on to_driver failed")?;

            let mut to_q = fetch_queue(&tx, to_driver)?;
            to_q.retain(|cid| cid != call_id);
            to_q.push(call_id.to_string());
            rewrite_queue_manual_mode(&tx, to_driver, &to_q)?;

            tx.execute(
                r#"
                UPDATE calls
                SET status='PENDING', status_updated_at=?1, updated_at=?1
                WHERE id=?2
                "#,
                params![ts, call_id],
            )?;

            event_append_call(
                &tx,
                call_id,
                "CALL_ACTIVE_REASSIGNED",
                Some(format!(
                    r#"{{"from_driver":"{from_driver_id}","to_driver":"{to_driver}","queued":true}}"#
                )),
            )?;
        } else {
            let assignment_id = uuid();
            tx.execute(
                r#"
                INSERT INTO call_assignments (
                  id, call_id, driver_id,
                  state, queue_position, manual_sort_key,
                  assigned_at, activated_at, ended_at
                ) VALUES (?1, ?2, ?3, 'ACTIVE', NULL, NULL, ?4, ?4, NULL)
                "#,
                params![assignment_id, call_id, to_driver, ts],
            )
            .context("insert active assignment on to_driver failed")?;

            tx.execute(
                r#"
                UPDATE calls
                SET status='ACTIVE', status_updated_at=?1, updated_at=?1
                WHERE id=?2
                "#,
                params![ts, call_id],
            )?;

            event_append_call(
                &tx,
                call_id,
                "CALL_ACTIVE_REASSIGNED",
                Some(format!(
                    r#"{{"from_driver":"{from_driver_id}","to_driver":"{to_driver}"}}"#
                )),
            )?;
        }
    } else {
        tx.execute(
            r#"
            UPDATE calls
            SET status='PENDING', status_updated_at=?1, updated_at=?1
            WHERE id=?2
            "#,
            params![ts, call_id],
        )?;

        event_append_call(
            &tx,
            call_id,
            "CALL_UNASSIGNED",
            Some(format!(r#"{{"from_driver":"{from_driver_id}"}}"#)),
        )?;
    }

    tx.commit().context("commit failed")?;
    Ok(())
}
