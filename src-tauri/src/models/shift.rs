use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverShiftRecord {
    pub id: String,
    pub driver_id: String,
    pub shift_start: String,
    pub lunch_start: String,
    pub lunch_end: String,
    pub shift_end: String,
    pub shift_label: Option<String>,
    pub is_cancelled: bool,
    pub created_at: String,
    pub updated_at: String,
}
