use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResults {
    pub drivers: Vec<SearchDriverHit>,
    pub calls: Vec<SearchCallHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchDriverHit {
    pub driver_id: String,
    pub display_name: String,
    pub availability_status: String,
    pub phone: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchCallHit {
    pub call_id: String,
    pub external_call_number: Option<String>,
    pub source_type: String,
    pub law_agency: Option<String>,
    pub pickup_address: String,
    pub dropoff_address: Option<String>,
    pub status: String,
    pub status_updated_at: String,
}
