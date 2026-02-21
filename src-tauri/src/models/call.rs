use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallRecord {
    pub id: String,
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
    pub status_updated_at: String,
    pub created_via: String,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub outcome: Option<String>,
    pub pricing_category: String,
    pub pricing_total: Option<f64>,
    pub pricing_notes: Option<String>,
    pub notes: Option<String>,
    pub priority_group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallAssignmentInfo {
    pub id: String,
    pub driver_id: String,
    pub state: String,
    pub queue_position: Option<i32>,
    pub manual_sort_key: Option<f64>,
    pub assigned_at: Option<String>,
    pub activated_at: Option<String>,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallDetail {
    pub call: CallRecord,
    pub assignments: Vec<CallAssignmentInfo>,
}
