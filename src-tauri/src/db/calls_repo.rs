use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::call::{CallAssignmentInfo, CallDetail, CallRecord};
use crate::models::aaa::AaaMemberCall;

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

fn valid_status(status: &str) -> bool {
    matches!(
        status,
        "ACTIVE" | "PENDING" | "ASSIGNED" | "EN_ROUTE" | "94" | "95" | "97" | "IN_TOW" | "98"
    )
}

fn valid_source(source: &str) -> bool {
    matches!(source, "AAA" | "AAA_RAP" | "PPI" | "COD" | "LAW_ENFORCEMENT")
}

fn valid_created_via(via: &str) -> bool {
    matches!(via, "MANUAL" | "OCR")
}

fn valid_pricing_category(category: &str) -> bool {
    matches!(category, "AAA" | "AAA_RAP" | "PPI" | "COD" | "LAW_ENFORCEMENT")
}

fn priority_group_for_tx(tx: &Transaction, source_type: &str) -> String {
    let key = format!("priority.group.{source_type}");
    if let Ok(value) = tx.query_row(
        "SELECT value FROM settings_kv WHERE key = ?1",
        [key],
        |r| r.get::<_, String>(0),
    ) {
        if value == "LAW_ENFORCEMENT" || value == "AAA" || value == "PPI_COD" {
            return value;
        }
    }

    match source_type {
        "LAW_ENFORCEMENT" => "LAW_ENFORCEMENT".to_string(),
        "AAA" | "AAA_RAP" => "AAA".to_string(),
        "PPI" | "COD" => "PPI_COD".to_string(),
        _ => "PPI_COD".to_string(),
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CallCreatePayload {
    pub external_call_number: Option<String>,
    pub source_type: String,
    pub law_agency: Option<String>,
    pub pickup_address: String,
    pub dropoff_address: Option<String>,
    pub pickup_notes: Option<String>,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub callback_phone: Option<String>,
    pub vehicle_description: Option<String>,
    pub membership_level: Option<String>,
    pub status: String,
    pub created_via: String,
    pub pricing_category: String,
    pub pricing_total: Option<f64>,
    pub pricing_notes: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CallUpdatePayload {
    pub external_call_number: Option<String>,
    pub source_type: Option<String>,
    pub law_agency: Option<String>,
    pub pickup_address: Option<String>,
    pub dropoff_address: Option<String>,
    pub pickup_notes: Option<String>,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub callback_phone: Option<String>,
    pub vehicle_description: Option<String>,
    pub membership_level: Option<String>,
    pub pricing_category: Option<String>,
    pub pricing_total: Option<f64>,
    pub pricing_notes: Option<String>,
    pub notes: Option<String>,
    pub priority_group: Option<String>,
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

pub fn call_create(conn: &mut Connection, payload: CallCreatePayload) -> Result<String> {
    if !valid_status(&payload.status) {
        anyhow::bail!("Invalid call status");
    }
    if !valid_source(&payload.source_type) {
        anyhow::bail!("Invalid call source_type");
    }
    if !valid_created_via(&payload.created_via) {
        anyhow::bail!("Invalid created_via");
    }
    if !valid_pricing_category(&payload.pricing_category) {
        anyhow::bail!("Invalid pricing category");
    }

    let id = uuid();
    let ts = now();
    let source_type = payload.source_type.clone();
    let tx = conn.transaction().context("begin tx failed")?;
    let priority_group = priority_group_for_tx(&tx, &payload.source_type);

    tx.execute(
        r#"
        INSERT INTO calls (
          id, external_call_number,
          source_type, law_agency,
          pickup_address, dropoff_address, pickup_notes, contact_id,
          contact_name, callback_phone, vehicle_description, membership_level,
          status, status_updated_at,
          created_via,
          created_at, updated_at,
          closed_at, outcome,
          pricing_category, pricing_total, pricing_notes,
          notes, priority_group
        ) VALUES (
          ?1, ?2,
          ?3, ?4,
          ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, ?12,
          ?13, ?14,
          ?15,
          ?16, ?17,
          NULL, NULL,
          ?18, ?19, ?20,
          ?21, ?22
        )
        "#,
        params![
            id,
            payload.external_call_number,
            payload.source_type,
            payload.law_agency,
            payload.pickup_address,
            payload.dropoff_address,
            payload.pickup_notes,
            payload.contact_id,
            payload.contact_name,
            payload.callback_phone,
            payload.vehicle_description,
            payload.membership_level,
            payload.status,
            ts,
            payload.created_via,
            ts,
            ts,
            payload.pricing_category,
            payload.pricing_total,
            payload.pricing_notes,
            payload.notes,
            priority_group
        ],
    )?;

    event_append_call(
        &tx,
        &id,
        "CALL_CREATED",
        Some(format!(r#"{{"source_type":"{}"}}"#, source_type)),
    )?;

    tx.commit().context("commit failed")?;

    Ok(id)
}

pub fn call_status_set(conn: &mut Connection, call_id: &str, status: &str) -> Result<()> {
    if !valid_status(status) {
        anyhow::bail!("Invalid call status");
    }
    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    let current_status: Option<String> = tx
        .query_row(
            "SELECT status FROM calls WHERE id=?1 AND outcome IS NULL",
            [call_id],
            |r| r.get(0),
        )
        .optional()?;
    if current_status.is_none() {
        anyhow::bail!("Call not found or already closed");
    }

    tx.execute(
        r#"
        UPDATE calls
        SET status=?1, status_updated_at=?2, updated_at=?2
        WHERE id=?3
        "#,
        params![status, ts, call_id],
    )?;

    event_append_call(
        &tx,
        call_id,
        "CALL_STATUS_CHANGED",
        Some(format!(
            r#"{{"from":"{}","to":"{}"}}"#,
            current_status.unwrap_or_default(),
            status
        )),
    )?;

    tx.commit().context("commit failed")?;
    Ok(())
}

fn end_active_assignment_if_any(tx: &Transaction, call_id: &str, ended_at: &str) -> Result<Option<String>> {
    let driver_id: Option<String> = tx
        .query_row(
            r#"
            SELECT driver_id
            FROM call_assignments
            WHERE call_id = ?1 AND state = 'ACTIVE'
            "#,
            [call_id],
            |r| r.get(0),
        )
        .optional()?;

    if driver_id.is_some() {
        tx.execute(
            r#"
            UPDATE call_assignments
            SET state='ENDED', ended_at=?1
            WHERE call_id=?2 AND state='ACTIVE'
            "#,
            params![ended_at, call_id],
        )?;
    }

    Ok(driver_id)
}

pub fn call_close(conn: &mut Connection, call_id: &str, outcome: &str) -> Result<()> {
    if outcome != "COMPLETED" && outcome != "CANCELLED" {
        anyhow::bail!("Invalid outcome; must be COMPLETED or CANCELLED");
    }

    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    let existing_outcome = tx
        .query_row(
            "SELECT outcome FROM calls WHERE id=?1",
            [call_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?;
    match existing_outcome {
        None => anyhow::bail!("Call not found"),
        Some(Some(_)) => anyhow::bail!("Call already closed"),
        Some(None) => {}
    }

    let active_driver_id = end_active_assignment_if_any(&tx, call_id, &ts)?;

    tx.execute(
        r#"
        UPDATE call_assignments
        SET state='ENDED', ended_at=?1
        WHERE call_id=?2 AND state IN ('QUEUED','ACTIVE')
        "#,
        params![ts, call_id],
    )?;

    tx.execute(
        r#"
        UPDATE calls
        SET outcome=?1,
            closed_at=?2,
            updated_at=?2,
            status='98',
            status_updated_at=?2
        WHERE id=?3
        "#,
        params![outcome, ts, call_id],
    )?;

    event_append_call(
        &tx,
        call_id,
        if outcome == "COMPLETED" { "CALL_COMPLETED" } else { "CALL_CANCELLED" },
        Some(match active_driver_id {
            Some(did) => format!(r#"{{"ended_active_driver":"{did}"}}"#),
            None => r#"{"ended_active_driver":null}"#.to_string(),
        }),
    )?;

    tx.commit().context("commit failed")?;
    Ok(())
}

pub fn call_cancel(conn: &mut Connection, call_id: &str) -> Result<()> {
    call_close(conn, call_id, "CANCELLED")
}

pub fn call_complete(conn: &mut Connection, call_id: &str) -> Result<()> {
    call_close(conn, call_id, "COMPLETED")
}

pub fn call_get(conn: &Connection, call_id: &str) -> Result<CallDetail> {
    let call: CallRecord = conn.query_row(
        r#"
        SELECT
          id,
          external_call_number,
          source_type,
          law_agency,
          pickup_address,
          dropoff_address,
          pickup_notes,
          contact_id,
          contact_name,
          callback_phone,
          vehicle_description,
          membership_level,
          status,
          status_updated_at,
          created_via,
          created_at,
          updated_at,
          closed_at,
          outcome,
          pricing_category,
          pricing_total,
          pricing_notes,
          notes,
          priority_group
        FROM calls
        WHERE id = ?1
        "#,
        [call_id],
        |row| {
            Ok(CallRecord {
                id: row.get(0)?,
                external_call_number: row.get(1)?,
                source_type: row.get(2)?,
                law_agency: row.get(3)?,
                pickup_address: row.get(4)?,
                dropoff_address: row.get(5)?,
                pickup_notes: row.get(6)?,
                contact_id: row.get(7)?,
                contact_name: row.get(8)?,
                callback_phone: row.get(9)?,
                vehicle_description: row.get(10)?,
                membership_level: row.get(11)?,
                status: row.get(12)?,
                status_updated_at: row.get(13)?,
                created_via: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                closed_at: row.get(17)?,
                outcome: row.get(18)?,
                pricing_category: row.get(19)?,
                pricing_total: row.get(20)?,
                pricing_notes: row.get(21)?,
                notes: row.get(22)?,
                priority_group: row.get(23)?,
            })
        },
    )?;

    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          driver_id,
          state,
          queue_position,
          manual_sort_key,
          assigned_at,
          activated_at,
          ended_at
        FROM call_assignments
        WHERE call_id = ?1
        ORDER BY assigned_at ASC
        "#,
    )?;

    let assignments = stmt
        .query_map([call_id], |row| {
            Ok(CallAssignmentInfo {
                id: row.get(0)?,
                driver_id: row.get(1)?,
                state: row.get(2)?,
                queue_position: row.get(3)?,
                manual_sort_key: row.get(4)?,
                assigned_at: row.get(5)?,
                activated_at: row.get(6)?,
                ended_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(CallDetail { call, assignments })
}

pub fn list_aaa_calls(conn: &Connection, limit: i64) -> Result<Vec<AaaMemberCall>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          external_call_number,
          source_type,
          membership_level,
          contact_name,
          callback_phone,
          notes,
          pricing_notes,
          pickup_notes,
          contact_id,
          (SELECT d.display_name
           FROM call_assignments ca
           JOIN drivers d ON d.id = ca.driver_id
           WHERE ca.call_id = calls.id
           ORDER BY
             COALESCE(ca.ended_at, ca.activated_at, ca.assigned_at) DESC
           LIMIT 1
          ) AS driver_name,
          pickup_address,
          dropoff_address,
          status,
          status_updated_at,
          outcome,
          closed_at
        FROM calls
        WHERE source_type IN ('AAA', 'AAA_RAP')
          AND status = '98'
        ORDER BY status_updated_at DESC
        LIMIT ?1
        "#,
    )?;

    let rows = stmt.query_map([limit], |row| {
        Ok(AaaMemberCall {
            call_id: row.get(0)?,
            external_call_number: row.get(1)?,
            source_type: row.get(2)?,
            membership_level: row.get(3)?,
            contact_name: row.get(4)?,
            callback_phone: row.get(5)?,
            notes: row.get(6)?,
            pricing_notes: row.get(7)?,
            pickup_notes: row.get(8)?,
            contact_id: row.get(9)?,
            driver_name: row.get(10)?,
            pickup_address: row.get(11)?,
            dropoff_address: row.get(12)?,
            status: row.get(13)?,
            status_updated_at: row.get(14)?,
            outcome: row.get(15)?,
            closed_at: row.get(16)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn call_update(conn: &mut Connection, call_id: &str, payload: CallUpdatePayload) -> Result<()> {
    if let Some(ref source_type) = payload.source_type {
        if !valid_source(source_type) {
            anyhow::bail!("Invalid call source_type");
        }
    }
    if let Some(ref pricing_category) = payload.pricing_category {
        if !valid_pricing_category(pricing_category) {
            anyhow::bail!("Invalid pricing category");
        }
    }

    let tx = conn.transaction().context("begin tx failed")?;
    let ts = now();

    let current: CallRecord = tx.query_row(
        r#"
        SELECT
          id,
          external_call_number,
          source_type,
          law_agency,
          pickup_address,
          dropoff_address,
          pickup_notes,
          contact_id,
          contact_name,
          callback_phone,
          vehicle_description,
          membership_level,
          status,
          status_updated_at,
          created_via,
          created_at,
          updated_at,
          closed_at,
          outcome,
          pricing_category,
          pricing_total,
          pricing_notes,
          notes,
          priority_group
        FROM calls
        WHERE id = ?1
        "#,
        [call_id],
        |row| {
            Ok(CallRecord {
                id: row.get(0)?,
                external_call_number: row.get(1)?,
                source_type: row.get(2)?,
                law_agency: row.get(3)?,
                pickup_address: row.get(4)?,
                dropoff_address: row.get(5)?,
                pickup_notes: row.get(6)?,
                contact_id: row.get(7)?,
                contact_name: row.get(8)?,
                callback_phone: row.get(9)?,
                vehicle_description: row.get(10)?,
                membership_level: row.get(11)?,
                status: row.get(12)?,
                status_updated_at: row.get(13)?,
                created_via: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                closed_at: row.get(17)?,
                outcome: row.get(18)?,
                pricing_category: row.get(19)?,
                pricing_total: row.get(20)?,
                pricing_notes: row.get(21)?,
                notes: row.get(22)?,
                priority_group: row.get(23)?,
            })
        },
    )?;

    let external_call_number = payload.external_call_number.or(current.external_call_number);
    let source_type = payload.source_type.unwrap_or(current.source_type);
    let law_agency = payload.law_agency.or(current.law_agency);
    let pickup_address = payload.pickup_address.unwrap_or(current.pickup_address);
    let dropoff_address = payload.dropoff_address.or(current.dropoff_address);
    let pickup_notes = payload.pickup_notes.or(current.pickup_notes);
    let contact_id = payload.contact_id.or(current.contact_id);
    let contact_name = payload.contact_name.or(current.contact_name);
    let callback_phone = payload.callback_phone.or(current.callback_phone);
    let vehicle_description = payload.vehicle_description.or(current.vehicle_description);
    let membership_level = payload.membership_level.or(current.membership_level);
    let pricing_category = payload.pricing_category.unwrap_or(current.pricing_category);
    let pricing_total = payload.pricing_total.or(current.pricing_total);
    let pricing_notes = payload.pricing_notes.or(current.pricing_notes);
    let notes = payload.notes.or(current.notes);
    let priority_group = payload
        .priority_group
        .unwrap_or_else(|| priority_group_for_tx(&tx, &source_type));

    tx.execute(
        r#"
        UPDATE calls
        SET external_call_number = ?1,
            source_type = ?2,
            law_agency = ?3,
            pickup_address = ?4,
            dropoff_address = ?5,
            pickup_notes = ?6,
            contact_id = ?7,
            contact_name = ?8,
            callback_phone = ?9,
            vehicle_description = ?10,
            membership_level = ?11,
            pricing_category = ?12,
            pricing_total = ?13,
            pricing_notes = ?14,
            notes = ?15,
            priority_group = ?16,
            updated_at = ?17
        WHERE id = ?18
        "#,
        params![
            external_call_number,
            source_type,
            law_agency,
            pickup_address,
            dropoff_address,
            pickup_notes,
            contact_id,
            contact_name,
            callback_phone,
            vehicle_description,
            membership_level,
            pricing_category,
            pricing_total,
            pricing_notes,
            notes,
            priority_group,
            ts,
            call_id
        ],
    )?;

    event_append_call(
        &tx,
        call_id,
        "CALL_UPDATED",
        Some(r#"{"updated":true}"#.to_string()),
    )?;

    tx.commit().context("commit failed")?;
    Ok(())
}
