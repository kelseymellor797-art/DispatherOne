use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrImportPreview {
    pub import_id: String,
    pub template_type: String,
    pub raw_text: String,
    pub pickup_address: Option<String>,
    pub dropoff_address: Option<String>,
    pub confidence: f64,
    pub call_number: Option<String>,
    pub work_type_id: Option<String>,
    pub vehicle_name: Option<String>,
    pub membership_level: Option<String>,
    pub pta: Option<String>,
    pub contact_id: Option<String>,
    pub phone_number: Option<String>,
    pub in_tow_eta: Option<String>,
}
