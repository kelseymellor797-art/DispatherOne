use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverCallReportItem {
    pub driver_id: String,
    pub call_id: String,
    pub outcome: String,
    pub closed_at: String,
    pub source_type: String,
    pub external_call_number: Option<String>,
    pub en_route_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallHistoryItem {
    pub call_id: String,
    pub external_call_number: Option<String>,
    pub source_type: String,
    pub law_agency: Option<String>,
    pub pickup_address: String,
    pub dropoff_address: Option<String>,
    pub vehicle_description: Option<String>,
    pub notes: Option<String>,
    pub driver_name: Option<String>,
    pub outcome: Option<String>,
    pub closed_at: Option<String>,
    pub created_at: String,
}
