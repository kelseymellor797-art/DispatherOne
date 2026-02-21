use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const GEOCODE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const DISTANCE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const GEOCODE_RATE_LIMIT_PER_MIN: usize = 30;

#[derive(Debug, Clone, Serialize)]
pub struct GeocodeValidationResult {
    pub input: String,
    pub formatted_address: String,
    pub place_id: String,
    pub lat: f64,
    pub lng: f64,
    pub address_components: Vec<AddressComponent>,
    pub validation_score: i32,
    pub result_count: usize,
    pub result_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AddressComponent {
    pub long_name: String,
    pub short_name: String,
    pub types: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DistanceMatrixResult {
    pub meters: f64,
    pub seconds: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MapQuestInfo {
    statuscode: i32,
    #[serde(default)]
    messages: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MapQuestLatLng {
    lat: f64,
    lng: f64,
}

#[derive(Debug, Deserialize)]
struct MapQuestLocation {
    #[serde(default)]
    street: String,
    #[serde(default)]
    #[serde(rename = "adminArea5")]
    admin_area5: String,
    #[serde(default)]
    #[serde(rename = "adminArea3")]
    admin_area3: String,
    #[serde(default)]
    #[serde(rename = "postalCode")]
    postal_code: String,
    #[serde(rename = "latLng")]
    lat_lng: MapQuestLatLng,
}

#[derive(Debug, Deserialize)]
struct MapQuestGeocodeResult {
    #[serde(default)]
    locations: Vec<MapQuestLocation>,
}

#[derive(Debug, Deserialize)]
struct MapQuestGeocodeResponse {
    info: MapQuestInfo,
    #[serde(default)]
    results: Vec<MapQuestGeocodeResult>,
}

#[derive(Debug, Deserialize)]
struct MapQuestRoute {
    distance: f64,
    #[serde(default)]
    time: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MapQuestDirectionsResponse {
    info: MapQuestInfo,
    #[serde(default)]
    route: Option<MapQuestRoute>,
}

struct CacheEntry<T> {
    value: T,
    expires_at: Instant,
}

static GEOCODE_CACHE: Lazy<Mutex<HashMap<String, CacheEntry<GeocodeValidationResult>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static DISTANCE_CACHE: Lazy<Mutex<HashMap<String, CacheEntry<DistanceMatrixResult>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static GEOCODE_CALLS: Lazy<Mutex<VecDeque<Instant>>> = Lazy::new(|| Mutex::new(VecDeque::new()));
static PAID_GEOCODE_COUNT: Lazy<Mutex<usize>> = Lazy::new(|| Mutex::new(0));
static PAID_DISTANCE_COUNT: Lazy<Mutex<usize>> = Lazy::new(|| Mutex::new(0));

fn mapquest_api_key() -> Result<String> {
    std::env::var("MAPQUEST_API_KEY").map_err(|_| anyhow!("MAPQUEST_API_KEY not set"))
}

fn http_client() -> Result<Client> {
    Ok(Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(8))
        .build()
        .context("build http client")?)
}

fn normalize_key(input: &str) -> String {
    input
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn cleanup_rate_window(times: &mut VecDeque<Instant>) {
    let cutoff = Instant::now() - Duration::from_secs(60);
    while let Some(front) = times.front() {
        if *front < cutoff {
            times.pop_front();
        } else {
            break;
        }
    }
}

fn check_geocode_rate_limit() -> Result<()> {
    let mut times = GEOCODE_CALLS.lock().unwrap();
    cleanup_rate_window(&mut times);
    if times.len() >= GEOCODE_RATE_LIMIT_PER_MIN {
        return Err(anyhow!(
            "Validation rate limit reached. Please wait a minute and try again."
        ));
    }
    times.push_back(Instant::now());
    Ok(())
}

fn increment_paid_geocode() {
    let mut count = PAID_GEOCODE_COUNT.lock().unwrap();
    *count += 1;
    println!("mapquest: paid_geocode_calls={}", *count);
}

fn increment_paid_distance() {
    let mut count = PAID_DISTANCE_COUNT.lock().unwrap();
    *count += 1;
    println!("mapquest: paid_distance_calls={}", *count);
}

fn map_geocode_error(info: &MapQuestInfo) -> Result<()> {
    if info.statuscode == 0 {
        return Ok(());
    }
    let message = info
        .messages
        .get(0)
        .cloned()
        .unwrap_or_else(|| format!("MapQuest geocode failed (code {}).", info.statuscode));
    Err(anyhow!(message))
}

fn map_distance_error(info: &MapQuestInfo) -> Result<()> {
    if info.statuscode == 0 {
        return Ok(());
    }
    let message = info
        .messages
        .get(0)
        .cloned()
        .unwrap_or_else(|| format!("MapQuest directions failed (code {}).", info.statuscode));
    Err(anyhow!(message))
}

fn has_street_number(text: &str) -> bool {
    text.chars().any(|c| c.is_ascii_digit())
}

fn build_components(location: &MapQuestLocation) -> Vec<AddressComponent> {
    let mut components = Vec::new();
    if !location.street.is_empty() {
        let mut types = vec!["route".to_string()];
        if let Some(first) = location.street.split_whitespace().next() {
            if first.chars().all(|c| c.is_ascii_digit()) {
                components.push(AddressComponent {
                    long_name: first.to_string(),
                    short_name: first.to_string(),
                    types: vec!["street_number".to_string()],
                });
                types.push("street_number".to_string());
            }
        }
        components.push(AddressComponent {
            long_name: location.street.clone(),
            short_name: location.street.clone(),
            types,
        });
    }
    if !location.admin_area5.is_empty() {
        components.push(AddressComponent {
            long_name: location.admin_area5.clone(),
            short_name: location.admin_area5.clone(),
            types: vec!["locality".to_string()],
        });
    }
    if !location.admin_area3.is_empty() {
        components.push(AddressComponent {
            long_name: location.admin_area3.clone(),
            short_name: location.admin_area3.clone(),
            types: vec!["administrative_area_level_1".to_string()],
        });
    }
    if !location.postal_code.is_empty() {
        components.push(AddressComponent {
            long_name: location.postal_code.clone(),
            short_name: location.postal_code.clone(),
            types: vec!["postal_code".to_string()],
        });
    }
    components
}

fn validation_score(input: &str, location: &MapQuestLocation, result_count: usize) -> i32 {
    let input_has_number = has_street_number(input);
    let has_street = !location.street.is_empty();
    let has_city = !location.admin_area5.is_empty();
    let has_state = !location.admin_area3.is_empty();
    let has_postal = !location.postal_code.is_empty();
    let mut score = 55;
    if has_street {
        score += 20;
    }
    if has_city {
        score += 5;
    }
    if has_state {
        score += 5;
    }
    if has_postal {
        score += 10;
    }
    if input_has_number && !has_street {
        score -= 25;
    }
    if result_count > 1 {
        score -= 10;
    }
    score.clamp(0, 100)
}

fn format_address(location: &MapQuestLocation) -> String {
    let mut parts = Vec::new();
    if !location.street.is_empty() {
        parts.push(location.street.trim().to_string());
    }
    let mut city_state = Vec::new();
    if !location.admin_area5.is_empty() {
        city_state.push(location.admin_area5.trim().to_string());
    }
    if !location.admin_area3.is_empty() {
        city_state.push(location.admin_area3.trim().to_string());
    }
    if !city_state.is_empty() {
        parts.push(city_state.join(", "));
    }
    if !location.postal_code.is_empty() {
        parts.push(location.postal_code.trim().to_string());
    }
    if parts.is_empty() {
        "Unknown address".to_string()
    } else {
        parts.join(" ")
    }
}

pub async fn geocode_validate(address: &str) -> Result<GeocodeValidationResult> {
    let trimmed = address.trim();
    if trimmed.len() < 6 {
        return Err(anyhow!("Address too short to validate."));
    }
    let key = normalize_key(trimmed);
    if let Some(entry) = GEOCODE_CACHE.lock().unwrap().get(&key) {
        if entry.expires_at > Instant::now() {
            return Ok(entry.value.clone());
        }
    }

    check_geocode_rate_limit()?;

    let key_env = mapquest_api_key()?;
    let client = http_client()?;
    let resp = client
        .get("https://www.mapquestapi.com/geocoding/v1/address")
        .query(&[("key", key_env.as_str()), ("location", trimmed)])
        .send()
        .await
        .context("MapQuest geocode request failed")?;
    let body: MapQuestGeocodeResponse =
        resp.json().await.context("MapQuest geocode json parse failed")?;
    map_geocode_error(&body.info)?;

    let first = body
        .results
        .get(0)
        .and_then(|r| r.locations.get(0))
        .ok_or_else(|| anyhow!("No geocode results found."))?;
    increment_paid_geocode();

    let formatted = format_address(first);
    let score = validation_score(trimmed, first, body.results.len());
    let components = build_components(first);
    let result_types = if !first.street.is_empty() {
        vec!["street_address".to_string()]
    } else if !first.admin_area5.is_empty() {
        vec!["locality".to_string()]
    } else {
        vec!["unknown".to_string()]
    };

    let result = GeocodeValidationResult {
        input: trimmed.to_string(),
        formatted_address: formatted.clone(),
        place_id: format!("mapquest:{},{}", first.lat_lng.lat, first.lat_lng.lng),
        lat: first.lat_lng.lat,
        lng: first.lat_lng.lng,
        address_components: components,
        validation_score: score,
        result_count: body.results.len(),
        result_types,
    };

    GEOCODE_CACHE.lock().unwrap().insert(
        key,
        CacheEntry {
            value: result.clone(),
            expires_at: Instant::now() + GEOCODE_TTL,
        },
    );
    Ok(result)
}

pub async fn distance_matrix(
    origin: &str,
    destination: &str,
    cache_key: Option<String>,
) -> Result<DistanceMatrixResult> {
    if let Some(key) = cache_key.as_ref() {
        if let Some(entry) = DISTANCE_CACHE.lock().unwrap().get(key) {
            if entry.expires_at > Instant::now() {
                return Ok(entry.value.clone());
            }
        }
    }

    let key_env = mapquest_api_key()?;
    let client = http_client()?;
    let resp = client
        .get("https://www.mapquestapi.com/directions/v2/route")
        .query(&[("key", key_env.as_str()), ("from", origin), ("to", destination)])
        .send()
        .await
        .context("MapQuest directions request failed")?;
    let body: MapQuestDirectionsResponse =
        resp.json().await.context("MapQuest directions json parse failed")?;
    map_distance_error(&body.info)?;

    let route = body.route.ok_or_else(|| anyhow!("No route returned."))?;
    let miles = route.distance;
    let meters = miles * 1609.34;
    let seconds = route.time;
    increment_paid_distance();

    let result = DistanceMatrixResult { meters, seconds };
    if let Some(key) = cache_key {
        DISTANCE_CACHE.lock().unwrap().insert(
            key,
            CacheEntry {
                value: result.clone(),
                expires_at: Instant::now() + DISTANCE_TTL,
            },
        );
    }
    Ok(result)
}
