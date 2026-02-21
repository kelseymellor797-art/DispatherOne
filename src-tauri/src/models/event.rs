use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventLogItem {
    pub id: String,
    pub timestamp: String,
    pub entity_type: String,
    pub entity_id: String,
    pub event_type: String,
    pub metadata_json: Option<String>,
    pub call_number: Option<String>,
    pub call_source_type: Option<String>,
    pub call_pickup: Option<String>,
    pub driver_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EventLogFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub search: Option<String>,
    pub entity_type: Option<String>,
    pub event_type: Option<String>,
    pub limit: Option<i64>,
}
