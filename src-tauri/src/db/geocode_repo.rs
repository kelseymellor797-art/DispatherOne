use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::google_maps;

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

fn sanitize_address(address: &str) -> String {
    let trimmed = address.trim();
    let base = trimmed.split('|').next().unwrap_or(trimmed);
    base.replace(['\n', '\r', '\t'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_addr(address: &str) -> String {
    address
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_addr_loose(address: &str) -> String {
    address
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == ' ' { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn store_geocode(
    conn: &Connection,
    normalized: &str,
    raw_address: &str,
    lat: f64,
    lon: f64,
    provider: &str,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO address_geocodes (normalized_address, raw_address, lat, lon, provider, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![normalized, raw_address, lat, lon, provider, now()],
    )?;
    Ok(())
}

pub fn store_geocode_result(
    conn: &Connection,
    input: &str,
    formatted_address: &str,
    lat: f64,
    lon: f64,
    provider: &str,
) -> Result<()> {
    let cleaned = sanitize_address(input);
    let norm = normalize_addr(&cleaned);
    store_geocode(conn, &norm, formatted_address, lat, lon, provider)
}

pub async fn geocode_address(conn: &Connection, address: &str) -> Result<(f64, f64)> {
    let cleaned = sanitize_address(address);
    let norm = normalize_addr(&cleaned);

    if let Some((lat, lon)) = conn
        .query_row(
            "SELECT lat, lon FROM address_geocodes WHERE normalized_address=?1",
            [norm.as_str()],
            |r| Ok((r.get::<_, f64>(0)?, r.get::<_, f64>(1)?)),
        )
        .optional()?
    {
        return Ok((lat, lon));
    }

    let norm_loose = normalize_addr_loose(&cleaned);
    if let Some((lat, lon)) = conn
        .query_row(
            r#"
            SELECT lat, lon
            FROM address_geocodes
            WHERE replace(replace(replace(replace(normalized_address, ',', ''), '.', ''), '#', ''), '-', '') = ?1
            "#,
            [norm_loose.as_str()],
            |r| Ok((r.get::<_, f64>(0)?, r.get::<_, f64>(1)?)),
        )
        .optional()?
    {
        return Ok((lat, lon));
    }

    let validated = google_maps::geocode_validate(&cleaned).await?;
    store_geocode(
        conn,
        &norm,
        &validated.formatted_address,
        validated.lat,
        validated.lng,
        "MAPQUEST",
    )?;
    Ok((validated.lat, validated.lng))
}

pub async fn geocode_address_with_bias(
    conn: &Connection,
    address: &str,
    _bias: Option<(f64, f64)>,
) -> Result<(f64, f64)> {
    geocode_address(conn, address).await
}

pub fn geocode_address_blocking(conn: &Connection, address: &str) -> Result<(f64, f64)> {
    tauri::async_runtime::block_on(geocode_address(conn, address))
        .map_err(|e| anyhow!(e.to_string()))
}
