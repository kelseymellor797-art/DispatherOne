use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitPosition {
    pub unit_id: String,
    pub truck_number: String,
    pub lat: f64,
    pub lng: f64,
    pub speed: f64,
    pub heading: f64,
    pub updated_at: String,
}
