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
