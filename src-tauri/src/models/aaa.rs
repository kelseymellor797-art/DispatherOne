use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AaaMemberCall {
    pub call_id: String,
    pub external_call_number: Option<String>,
    pub source_type: String,
    pub membership_level: Option<String>,
    pub contact_name: Option<String>,
    pub callback_phone: Option<String>,
    pub notes: Option<String>,
    pub pricing_notes: Option<String>,
    pub driver_name: Option<String>,
    pub pickup_notes: Option<String>,
    pub contact_id: Option<String>,
    pub pickup_address: String,
    pub dropoff_address: Option<String>,
    pub status: String,
    pub status_updated_at: String,
    pub outcome: Option<String>,
    pub closed_at: Option<String>,
}
