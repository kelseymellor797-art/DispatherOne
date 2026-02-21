use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSnapshot {
    pub drivers: Vec<DriverDashboardItem>,
    pub unassigned_calls: Vec<CallSummary>,
    pub settings: DashboardSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverDashboardItem {
    pub driver_id: String,
    pub display_name: String,
    pub availability_status: String,
    pub availability_updated_at: String,
    pub phone: Option<String>,
    pub capabilities: Option<String>,
    pub notes: Option<String>,
    pub last_location: Option<String>,
    pub last_location_updated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub today_shift_start: Option<String>,
    pub current_truck: Option<CurrentTruck>,
    pub active_call: Option<CallSummary>,
    pub pending_queue: Vec<CallSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentTruck {
    pub truck_number: String,
    pub assigned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallSummary {
    pub call_id: String,
    pub external_call_number: Option<String>,
    pub source_type: String,
    pub law_agency: Option<String>,
    pub pickup_address: String,
    pub dropoff_address: Option<String>,
    pub status: String,
    pub status_updated_at: String,
    pub created_at: String,
    pub membership_level: Option<String>,
    pub contact_id: Option<String>,
    pub callback_phone: Option<String>,
    pub notes: Option<String>,
    pub pricing_total: Option<f64>,
    pub pricing_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DashboardSettings {
    pub width_percent: Option<i32>,
    pub dock_side: Option<String>,
    pub always_on_top: Option<bool>,
    pub alerts_interval_minutes: Option<i32>,
}
