use serde::{Deserialize, Serialize};

use crate::models::shift::DriverShiftRecord;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverRecord {
    pub id: String,
    pub display_name: String,
    pub availability_status: String,
    pub availability_updated_at: String,
    pub phone: Option<String>,
    pub capabilities: Option<String>,
    pub notes: Option<String>,
    pub last_location: Option<String>,
    pub last_location_updated_at: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverTruckInfo {
    pub truck_number: String,
    pub assigned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverDetail {
    pub driver: DriverRecord,
    pub current_truck: Option<DriverTruckInfo>,
    pub today_shifts: Vec<DriverShiftRecord>,
}
