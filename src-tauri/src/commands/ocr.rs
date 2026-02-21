use std::fs;
use std::path::PathBuf;
use std::process::Command;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STD;
use regex::Regex;
use tauri::{AppHandle, State};
use tauri::Manager;

use crate::db::calls_repo::{self, CallCreatePayload};
use crate::db::ocr_repo;
use crate::db::settings_repo;
use crate::db::DbState;
use crate::models::ocr::OcrImportPreview;
use uuid::Uuid;

struct ParsedFields {
    call_number: Option<String>,
    work_type_id: Option<String>,
    vehicle_name: Option<String>,
    membership_level: Option<String>,
    street_city: Option<String>,
    pta: Option<String>,
    contact_id: Option<String>,
    phone_number: Option<String>,
    in_tow_eta: Option<String>,
}

fn strip_data_prefix(data: &str) -> &str {
    if let Some(idx) = data.find(",") {
        let prefix = &data[..idx];
        if prefix.contains("base64") {
            return &data[idx + 1..];
        }
    }
    data
}

fn ensure_dir(path: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
const WINDOWS_TESSERACT_PATHS: [&str; 3] = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files\Tesseract-real.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
];

#[cfg(target_os = "windows")]
fn hide_windows_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

fn tesseract_command(custom_path: Option<&str>, tessdata_path: Option<&str>) -> Command {
    #[cfg(target_os = "windows")]
    {
        if let Some(custom) = custom_path {
            let custom_path = PathBuf::from(custom);
            if custom_path.exists() {
                let mut cmd = Command::new(custom_path);
                if let Some(tessdata) = tessdata_path {
                    cmd.env("TESSDATA_PREFIX", tessdata);
                }
                hide_windows_console(&mut cmd);
                return cmd;
            }
        }
        if let Ok(custom) = std::env::var("TESSERACT_PATH") {
            let custom_path = PathBuf::from(custom);
            if custom_path.exists() {
                let mut cmd = Command::new(custom_path);
                if let Some(tessdata) = tessdata_path {
                    cmd.env("TESSDATA_PREFIX", tessdata);
                }
                hide_windows_console(&mut cmd);
                return cmd;
            }
        }
        for candidate in WINDOWS_TESSERACT_PATHS {
            let path = PathBuf::from(candidate);
            if path.exists() {
                let mut cmd = Command::new(path);
                if let Some(tessdata) = tessdata_path {
                    cmd.env("TESSDATA_PREFIX", tessdata);
                }
                hide_windows_console(&mut cmd);
                return cmd;
            }
        }
    }
    let mut cmd = Command::new("tesseract");
    if let Some(tessdata) = tessdata_path {
        cmd.env("TESSDATA_PREFIX", tessdata);
    }
    #[cfg(target_os = "windows")]
    {
        hide_windows_console(&mut cmd);
    }
    cmd
}

fn ensure_tesseract_available(custom_path: Option<&str>, tessdata_path: Option<&str>) -> Result<(), String> {
    let mut cmd = tesseract_command(custom_path, tessdata_path);
    let output = cmd
        .arg("--version")
        .output()
        .map_err(|e| format!("Tesseract not found: {e}"))?;
    if !output.status.success() {
        return Err("Tesseract not available".to_string());
    }
    Ok(())
}

fn ensure_ocr_available(custom_path: Option<&str>, tessdata_path: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return ensure_tesseract_available(custom_path, tessdata_path);
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("swift")
            .arg("--version")
            .output()
            .map_err(|e| format!("Swift not available: {e}"))?;
        if !output.status.success() {
            return Err("Swift not available".to_string());
        }
        return Ok(());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    return ensure_tesseract_available(custom_path, tessdata_path);
}

fn score_text(text: &str) -> i32 {
    let lower = text.to_lowercase();
    let labels = [
        "call", "work type", "member", "contact id", "phone", "street", "city", "pta", "vehicle",
        "status", "pickup", "drop off", "dropoff",
    ];
    let mut score = 0;
    for label in labels {
        if lower.contains(label) {
            score += 2;
        }
    }
    if Regex::new(r"\b\d{6,}\b").ok().map_or(false, |re| re.is_match(text)) {
        score += 2;
    }
    if Regex::new(r"\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b")
        .ok()
        .map_or(false, |re| re.is_match(text))
    {
        score += 2;
    }
    score
}

fn run_tesseract(image_path: &PathBuf, custom_path: Option<&str>, tessdata_path: Option<&str>) -> Result<String, String> {
    let attempts: Vec<Vec<&str>> = vec![
        vec!["-l", "eng", "--oem", "1", "--psm", "6", "-c", "user_defined_dpi=300", "-c", "preserve_interword_spaces=1"],
        vec!["-l", "eng", "--oem", "1", "--psm", "4", "-c", "user_defined_dpi=300", "-c", "preserve_interword_spaces=1"],
    ];

    let mut best_text = None;
    let mut best_score = -1;

    for args in attempts {
        let mut cmd = tesseract_command(custom_path, tessdata_path);
        cmd.arg(image_path).arg("stdout");
        for arg in &args {
            cmd.arg(arg);
        }
        let output = cmd.output().map_err(|e| format!("Failed to run tesseract: {e}"))?;
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout).to_string();
        let score = score_text(&text);
        if score > best_score {
            best_score = score;
            best_text = Some(text);
            if best_score >= 12 {
                break;
            }
        }
    }

    best_text.ok_or_else(|| "Tesseract failed to read image".to_string())
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn run_windows_ocr(image_path: &PathBuf) -> Result<String, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$Path = $env:OCR_IMAGE_PATH
if ([string]::IsNullOrWhiteSpace($Path)) { throw "Missing OCR image path." }

function Get-OcrEngine {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -ne $engine) { return $engine }
  $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
  if ($null -eq $langs -or $langs.Count -eq 0) { throw "No OCR languages installed. Please install English (United States) in Windows language settings." }
  $target = $langs | Where-Object { $_.LanguageTag -eq "en-US" } | Select-Object -First 1
  if ($null -eq $target) { $target = $langs | Select-Object -First 1 }
  [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($target)
}

function Get-OcrText {
  param([string]$InputPath, $Engine)
  $storageFile = [Windows.Storage.StorageFile]::GetFileFromPathAsync($InputPath).GetAwaiter().GetResult()
  $stream = $storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read).GetAwaiter().GetResult()
  $decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()
  $softwareBitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()
  if ($softwareBitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8 -or $softwareBitmap.BitmapAlphaMode -ne [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied) {
    $softwareBitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert(
      $softwareBitmap,
      [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
      [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied
    )
  }
  $result = $Engine.RecognizeAsync($softwareBitmap).GetAwaiter().GetResult()
  $result.Text
}

function Score-Text {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return 0 }
  return ([regex]::Matches($Text, "[A-Za-z0-9]").Count)
}

function Save-PreparedImage {
  param([string]$InPath, [string]$OutPath, [double]$Scale, [bool]$HighContrast)
  $source = [System.Drawing.Image]::FromFile($InPath)
  $newWidth = [Math]::Max([int]($source.Width * $Scale), 1)
  $newHeight = [Math]::Max([int]($source.Height * $Scale), 1)
  $bitmap = New-Object System.Drawing.Bitmap($newWidth, $newHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $bitmap.SetResolution(300, 300)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::White)

  if ($HighContrast) {
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    $contrast = 1.5
    $t = 0.5 * (1.0 - $contrast)
    $matrix = New-Object System.Drawing.Imaging.ColorMatrix(@(
      @($contrast, 0, 0, 0, 0),
      @(0, $contrast, 0, 0, 0),
      @(0, 0, $contrast, 0, 0),
      @(0, 0, 0, 1, 0),
      @($t, $t, $t, 0, 1)
    ))
    $attr.SetColorMatrix($matrix)
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $newWidth, $newHeight)), 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  } else {
    $graphics.DrawImage($source, 0, 0, $newWidth, $newHeight)
  }
  $graphics.Dispose()
  $source.Dispose()
  $bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$prepPath = Join-Path $env:TEMP ("ocr_prep_" + [Guid]::NewGuid().ToString() + ".png")
$prepHighPath = Join-Path $env:TEMP ("ocr_prep_hi_" + [Guid]::NewGuid().ToString() + ".png")
$tempFiles = @($prepPath, $prepHighPath)
$scale = 1.0
try {
  $probe = [System.Drawing.Image]::FromFile($Path)
  if ($probe.Width -lt 1600 -or $probe.Height -lt 900) { $scale = 2.0 }
  $probe.Dispose()
} catch {}
Save-PreparedImage -InPath $Path -OutPath $prepPath -Scale $scale -HighContrast:$false
Save-PreparedImage -InPath $Path -OutPath $prepHighPath -Scale $scale -HighContrast:$true

$engine = Get-OcrEngine
if ($null -eq $engine) { throw "Windows OCR engine unavailable." }

$candidates = @(
  @{ Path = $prepPath; Text = (Get-OcrText -InputPath $prepPath -Engine $engine) },
  @{ Path = $prepHighPath; Text = (Get-OcrText -InputPath $prepHighPath -Engine $engine) },
  @{ Path = $Path; Text = (Get-OcrText -InputPath $Path -Engine $engine) }
)
$best = $candidates | Sort-Object { Score-Text $_.Text } -Descending | Select-Object -First 1
$finalText = $best.Text
foreach ($file in $tempFiles) {
  if (Test-Path $file) { Remove-Item $file -ErrorAction SilentlyContinue }
}
$finalText
"#;
    let script_path = std::env::temp_dir().join(format!("dispatcherone_ocr_{}.ps1", Uuid::new_v4()));
    fs::write(&script_path, script).map_err(|e| e.to_string())?;
    let mut cmd = Command::new("powershell");
    cmd.arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-STA")
        .arg("-File")
        .arg(&script_path)
        .env("OCR_IMAGE_PATH", image_path);
    #[cfg(target_os = "windows")]
    {
        hide_windows_console(&mut cmd);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run Windows OCR: {e}"))?;
    let _ = fs::remove_file(&script_path);
    if !output.status.success() {
        return Err(decode_powershell_output(&output.stderr).trim().to_string());
    }
    Ok(decode_powershell_output(&output.stdout))
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn decode_powershell_output(bytes: &[u8]) -> String {
    if bytes.len() >= 2 {
        let null_count = bytes.iter().filter(|b| **b == 0).count();
        if null_count > bytes.len() / 4 {
            let mut u16_buf = Vec::with_capacity(bytes.len() / 2);
            for chunk in bytes.chunks(2) {
                if chunk.len() == 2 {
                    u16_buf.push(u16::from_le_bytes([chunk[0], chunk[1]]));
                }
            }
            return String::from_utf16_lossy(&u16_buf);
        }
    }
    String::from_utf8_lossy(bytes).to_string()
}

#[cfg(target_os = "macos")]
fn run_macos_ocr(image_path: &PathBuf) -> Result<String, String> {
    let script = r#"
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path) else {
  FileHandle.standardError.write(Data("Failed to load image".utf8))
  exit(1)
}
guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write(Data("Failed to create CGImage".utf8))
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
  try handler.perform([request])
} catch {
  FileHandle.standardError.write(Data("Vision request failed".utf8))
  exit(1)
}

let observations = request.results ?? []
let lines = observations.compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
"#;
    let script_path = std::env::temp_dir().join(format!("dispatcherone_ocr_{}.swift", Uuid::new_v4()));
    fs::write(&script_path, script).map_err(|e| e.to_string())?;
    let output = Command::new("swift")
        .arg(&script_path)
        .arg(image_path)
        .output()
        .map_err(|e| format!("Failed to run macOS OCR: {e}"))?;
    let _ = fs::remove_file(&script_path);
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn ocr_pick_image_path() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        println!("ocr_pick_image_path: opening macOS file picker");
        let script = r#"POSIX path of (choose file of type {"png","jpg","jpeg","heic","heif","bmp","tif","tiff","webp"})"#;
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to open file picker: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.to_lowercase().contains("user canceled") {
                println!("ocr_pick_image_path: user canceled");
                return Ok(None);
            }
            println!("ocr_pick_image_path: error {}", stderr.trim());
            return Err(stderr.trim().to_string());
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        println!("ocr_pick_image_path: selected {}", path);
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }
    #[cfg(target_os = "windows")]
    {
        let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Images|*.png;*.jpg;*.jpeg;*.heic;*.heif;*.bmp;*.tif;*.tiff;*.webp"
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq "OK") { [Console]::Out.Write($dialog.FileName) }
"#;
        let mut cmd = Command::new("powershell");
        cmd.arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-STA")
            .arg("-Command")
            .arg(script);
        #[cfg(target_os = "windows")]
        {
            hide_windows_console(&mut cmd);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to open file picker: {e}"))?;
        if !output.status.success() {
            return Err(decode_powershell_output(&output.stderr).trim().to_string());
        }
        let path = decode_powershell_output(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("File picker not supported on this platform.".to_string())
    }
}

fn run_platform_ocr(image_path: &PathBuf, custom_path: Option<&str>, tessdata_path: Option<&str>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        return run_tesseract(image_path, custom_path, tessdata_path);
    }
    #[cfg(target_os = "macos")]
    {
        return run_macos_ocr(image_path);
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
    return run_tesseract(image_path, custom_path, tessdata_path);
}
}

fn maybe_convert_heic_to_png(image_path: &PathBuf) -> Result<PathBuf, String> {
    let ext = image_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();
    if ext != "heic" && ext != "heif" {
        return Ok(image_path.clone());
    }
    let mut png_path = image_path.clone();
    png_path.set_extension("png");
    let output = Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(image_path)
        .arg("--out")
        .arg(&png_path)
        .output()
        .map_err(|e| format!("Failed to convert HEIC: {e}"))?;
    if !output.status.success() {
        return Err("Failed to convert HEIC image".to_string());
    }
    Ok(png_path)
}

fn build_ocr_variants(image_path: &PathBuf, include_rotations: bool, max_size: u32) -> Vec<PathBuf> {
    let mut variants = Vec::new();
    variants.push(image_path.clone());

    let mut scaled_path = image_path.clone();
    let stem = scaled_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("ocr");
    scaled_path.set_file_name(format!("{stem}_scale{max_size}.png"));
    let scaled_output = Command::new("sips")
        .arg("-Z")
        .arg(max_size.to_string())
        .arg(image_path)
        .arg("--out")
        .arg(&scaled_path)
        .output();
    if let Ok(result) = scaled_output {
        if result.status.success() {
            variants.push(scaled_path);
        }
    }

    if include_rotations {
        let bases = variants.clone();
        let angles = [90, 180, 270];
        for base in bases {
            for angle in angles {
                let mut rotated_path = base.clone();
                let base_stem = rotated_path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("ocr");
                rotated_path.set_file_name(format!("{base_stem}_rot{angle}.png"));
                let output = Command::new("sips")
                    .arg("-r")
                    .arg(angle.to_string())
                    .arg(&base)
                    .arg("--out")
                    .arg(&rotated_path)
                    .output();
                if let Ok(result) = output {
                    if result.status.success() {
                        variants.push(rotated_path);
                    }
                }
            }
        }
    }

    variants
}

fn run_platform_ocr_variants(
    image_paths: &[PathBuf],
    custom_path: Option<&str>,
    tessdata_path: Option<&str>,
) -> Result<String, String> {
    let mut best_text = None;
    let mut best_score = -1;

    for image_path in image_paths {
        if let Ok(text) = run_platform_ocr(image_path, custom_path, tessdata_path) {
            let score = score_text(&text);
            if score > best_score {
                best_score = score;
                best_text = Some(text);
            }
        }
    }

    best_text.ok_or_else(|| "Tesseract failed to read image".to_string())
}

fn load_tesseract_path(db: &DbState) -> Option<String> {
    let conn = db.conn.lock().ok()?;
    let keys = vec!["tesseract.path".to_string()];
    let values = settings_repo::settings_get(&conn, &keys).ok()?;
    values.get("tesseract.path").cloned().filter(|value| !value.trim().is_empty())
}

fn bundled_tesseract_paths(app: &AppHandle) -> Option<(String, String)> {
    let resource_dir = app.path().resource_dir().ok()?;
    let exe_path = resource_dir.join("tesseract").join("tesseract.exe");
    let tessdata_path = resource_dir.join("tesseract").join("tessdata");
    if exe_path.exists() {
        let exe_str = exe_path.to_string_lossy().to_string();
        let tessdata_str = tessdata_path.to_string_lossy().to_string();
        return Some((exe_str, tessdata_str));
    }
    None
}

fn build_preview(
    conn: &rusqlite::Connection,
    template_type: String,
    image_path: &PathBuf,
    raw_text: String,
) -> Result<OcrImportPreview, String> {
    let parsed = if template_type == "ACE_DROPOFF" {
        ParsedFields {
            call_number: None,
            work_type_id: None,
            vehicle_name: None,
            membership_level: None,
            street_city: parse_street_city_only(&raw_text),
            pta: None,
            contact_id: None,
            phone_number: None,
            in_tow_eta: None,
        }
    } else {
        parse_fields(&raw_text)
    };
    let parsed_fields_json = None;
    let confidence_json = None;

    let import_id = ocr_repo::ocr_import_create(
        conn,
        &template_type,
        image_path.to_string_lossy().as_ref(),
        &raw_text,
        parsed_fields_json,
        confidence_json,
    )
    .map_err(|e| e.to_string())?;

    let pickup_address = if template_type == "ACE_PICKUP" {
        parsed
            .street_city
            .clone()
            .map(|value| trim_trailing_noise_address(&trim_trailing_punct(&value)))
    } else {
        None
    };
    let dropoff_address = if template_type == "ACE_DROPOFF" {
        parsed
            .street_city
            .clone()
            .map(|value| trim_trailing_noise_address(&trim_trailing_punct(&value)))
    } else {
        None
    };

    let (call_number, work_type_id, vehicle_name, membership_level, pta, contact_id, phone_number, in_tow_eta) =
        if template_type == "ACE_DROPOFF" {
            (None, None, None, None, None, None, None, None)
        } else {
            (
                parsed.call_number,
                parsed.work_type_id,
                parsed.vehicle_name,
                parsed.membership_level,
                parsed.pta,
                parsed.contact_id,
                parsed.phone_number,
                parsed.in_tow_eta,
            )
        };

    Ok(OcrImportPreview {
        import_id,
        template_type,
        raw_text,
        pickup_address,
        dropoff_address,
        confidence: 0.0,
        call_number,
        work_type_id,
        vehicle_name,
        membership_level,
        pta,
        contact_id,
        phone_number,
        in_tow_eta,
    })
}

fn line_value(line: &str, label: &str) -> Option<String> {
    let lower = line.to_lowercase();
    let label_lower = label.to_lowercase();
    if let Some(idx) = lower.find(&label_lower) {
        let raw = &line[idx + label.len()..];
        let cleaned = raw.trim().trim_start_matches(':').trim();
        if cleaned.is_empty() {
            None
        } else {
            Some(cleaned.to_string())
        }
    } else {
        None
    }
}

fn clean_value(raw: &str) -> String {
    let filtered: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric()
                || c == ' '
                || c == '-'
                || c == '/'
                || c == ','
                || c == '.'
                || c == '#'
            {
                c
            } else {
                ' '
            }
        })
        .collect();
    let collapsed = filtered.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.trim().to_string()
}

fn trim_trailing_noise(raw: &str) -> String {
    let mut parts: Vec<&str> = raw.split_whitespace().collect();
    while let Some(last) = parts.last() {
        let is_short = last.len() <= 2;
        let is_alpha = last.chars().all(|c| c.is_ascii_alphabetic());
        if is_short && is_alpha {
            parts.pop();
        } else {
            break;
        }
    }
    parts.join(" ").trim().to_string()
}

fn trim_trailing_noise_address(raw: &str) -> String {
    let suffixes = [
        "st", "ave", "blvd", "rd", "dr", "ln", "ct", "way", "pl", "plz", "hwy", "pkwy", "cir",
        "ter", "trl",
    ];
    let states = [
        "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia",
        "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
        "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt",
        "va", "wa", "wv", "wi", "wy",
    ];
    let mut parts: Vec<&str> = raw.split_whitespace().collect();
    while let Some(last) = parts.last() {
        let lower = last.trim_matches(|c: char| c == ',' || c == '.').to_lowercase();
        if suffixes.contains(&lower.as_str()) || states.contains(&lower.as_str()) {
            break;
        }
        let is_short = lower.len() <= 2;
        let is_alpha = lower.chars().all(|c| c.is_ascii_alphabetic());
        if is_short && is_alpha {
            parts.pop();
        } else {
            break;
        }
    }
    parts.join(" ").trim().to_string()
}

fn clean_words(raw: &str, max_words: usize) -> String {
    let cleaned = fix_common_ocr_typos(&normalize_camelcase_spacing(&clean_value(raw)));
    let mut words = Vec::new();
    for word in cleaned.split_whitespace() {
        let is_short_alpha = word.len() <= 2 && word.chars().all(|c| c.is_ascii_alphabetic());
        let is_all_digits = word.chars().all(|c| c.is_ascii_digit());
        if is_short_alpha {
            continue;
        }
        if is_all_digits {
            continue;
        }
        words.push(word.to_string());
        if words.len() >= max_words {
            break;
        }
    }
    let joined = words.join(" ").trim().to_string();
    trim_trailing_noise(&joined)
}

fn clean_vehicle(raw: &str) -> String {
    let mut value = fix_common_ocr_typos(&clean_value(raw));
    if let Some(idx) = value.rfind(')') {
        value = value[..=idx].to_string();
    }
    value = trim_trailing_noise(&value);
    value.trim().to_string()
}

fn fix_common_ocr_typos(value: &str) -> String {
    let mut fixed = value.to_string();
    let replacements = [
        (r"(?i)\baj\s*way\b", "Airway"),
        (r"(?i)\bajway\b", "Airway"),
        (r"(?i)\bdiezo\b", "Diego"),
        (r"(?i)\bpassengercar\b", "Passenger Car"),
        (r"(?i)\bcar\s*low\b", "Car Tow"),
        (r"(?i)\bcarlow\b", "Car Tow"),
        (r"(?i)\bcartow\b", "Car Tow"),
        (r"(?i)\bjoep\b", "Jeep"),
        (r"(?i)\beh\s*st\b", "E H St"),
        (r"(?i)\be\s*h\s*st\b", "East H St"),
    ];
    for (pattern, replacement) in replacements {
        if let Ok(re) = Regex::new(pattern) {
            fixed = re.replace_all(&fixed, replacement).to_string();
        }
    }
    if fixed.to_lowercase().contains("san diego") && fixed.to_lowercase().contains(" ca ") {
        if let Ok(re) = Regex::new(r"\b99(\d{3})\b") {
            fixed = re.replace_all(&fixed, "92$1").to_string();
        }
    }
    fixed
}

fn normalize_camelcase_spacing(value: &str) -> String {
    if let Ok(re) = Regex::new(r"([a-z])([A-Z])") {
        return re.replace_all(value, "$1 $2").to_string();
    }
    value.to_string()
}

fn normalize_name_spacing(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.contains(' ') {
        return trimmed.to_string();
    }
    if !trimmed.chars().all(|c| c.is_ascii_alphabetic()) {
        return trimmed.to_string();
    }
    let len = trimmed.len();
    if len < 8 || len > 14 {
        return trimmed.to_string();
    }
    let bytes = trimmed.as_bytes();
    let split = len / 2;
    let vowels = [b'a', b'e', b'i', b'o', b'u', b'A', b'E', b'I', b'O', b'U'];
    let search_range = 2usize;
    let mut best = None;
    for offset in 0..=search_range {
        if split + offset < len {
            let idx = split + offset;
            if vowels.contains(&bytes[idx.saturating_sub(1)]) || vowels.contains(&bytes[idx]) {
                best = Some(idx);
                break;
            }
        }
        if split >= offset && split - offset >= 2 {
            let idx = split - offset;
            if vowels.contains(&bytes[idx.saturating_sub(1)]) || vowels.contains(&bytes[idx]) {
                best = Some(idx);
                break;
            }
        }
    }
    if let Some(idx) = best {
        let (left, right) = trimmed.split_at(idx);
        return format!("{} {}", left, right);
    }
    let (left, right) = trimmed.split_at(split);
    format!("{} {}", left, right)
}

fn clean_street_city(raw: &str) -> String {
    let cleaned = fix_common_ocr_typos(&normalize_address_spacing(&clean_value(raw)));
    if let Ok(re) = Regex::new(r"^(.+?\b\d{5})(?:\b|$)") {
        if let Some(caps) = re.captures(&cleaned) {
            return caps
                .get(1)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or(cleaned);
        }
    }
    let trimmed = trim_trailing_noise_address(&trim_trailing_punct(&cleaned));
    trim_trailing_punct(&trimmed)
}

fn normalize_address_spacing(value: &str) -> String {
    let mut out = value.to_string();
    if let Ok(re) = Regex::new(r"(\d)([A-Za-z])") {
        out = re.replace_all(&out, "$1 $2").to_string();
    }
    if let Ok(re) = Regex::new(r"([A-Za-z])(\d)") {
        out = re.replace_all(&out, "$1 $2").to_string();
    }
    if let Ok(re) = Regex::new(r"\b(\d+)\s+(st|nd|rd|th)\b") {
        out = re.replace_all(&out, "$1$2").to_string();
    }
    let suffixes = [
        "st", "ave", "blvd", "rd", "dr", "ln", "ct", "way", "pl", "plz", "hwy", "pkwy", "cir",
        "ter", "trl",
    ];
    let keep_dual = ["ne", "nw", "se", "sw"];
    let expand_compass = [("n", "North"), ("s", "South"), ("e", "East"), ("w", "West")];
    let mut tokens = Vec::new();
    let raw_tokens: Vec<&str> = out.split_whitespace().collect();
    for (idx, token) in raw_tokens.iter().enumerate() {
        let mut core = token.to_string();
        let mut trailing = String::new();
        while let Some(ch) = core.chars().last() {
            if ch == ',' || ch == '.' {
                trailing.insert(0, ch);
                core.pop();
            } else {
                break;
            }
        }
        let lower = core.to_lowercase();
        let mut split = None;
        for suffix in &suffixes {
            if lower.ends_with(suffix) && lower.len() > suffix.len() + 1 {
                let cut = core.len() - suffix.len();
                split = Some((core[..cut].to_string(), core[cut..].to_string()));
                break;
            }
        }
        if let Some((head, tail)) = split {
            tokens.push(head);
            tokens.push(format!("{}{}", tail, trailing));
            continue;
        }
        let lower = core.to_lowercase();
        let next_lower = raw_tokens
            .get(idx + 1)
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        let next_next_lower = raw_tokens
            .get(idx + 2)
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        let is_two_letters = lower.len() == 2 && lower.chars().all(|c| c.is_ascii_alphabetic());
        let next_is_suffix = suffixes.iter().any(|suffix| next_lower.starts_with(suffix));
        if is_two_letters && next_is_suffix && !keep_dual.contains(&lower.as_str()) {
            let chars: Vec<char> = core.chars().collect();
            let first = chars[0].to_string();
            let first_lower = first.to_lowercase();
            if let Some((_, full)) = expand_compass.iter().find(|(abbr, _)| abbr == &first_lower.as_str()) {
                tokens.push(full.to_string());
            } else {
                tokens.push(first);
            }
            tokens.push(format!("{}{}", chars[1], trailing));
            continue;
        }
        let is_single_letter = lower.len() == 1 && lower.chars().all(|c| c.is_ascii_alphabetic());
        let next_is_single_letter =
            next_lower.len() == 1 && next_lower.chars().all(|c| c.is_ascii_alphabetic());
        let next_next_is_suffix = suffixes.iter().any(|suffix| next_next_lower.starts_with(suffix));
        if is_single_letter && next_is_single_letter && next_next_is_suffix {
            if let Some((_, full)) = expand_compass.iter().find(|(abbr, _)| abbr == &lower.as_str())
            {
                tokens.push(format!("{}{}", full, trailing));
                continue;
            }
        }
        if lower.len() == 1 {
            if let Some((_, full)) = expand_compass.iter().find(|(abbr, _)| abbr == &lower.as_str()) {
                tokens.push(format!("{}{}", full, trailing));
                continue;
            }
        }
        tokens.push(format!("{}{}", core, trailing));
    }
    tokens.join(" ").trim().to_string()
}

fn trim_trailing_punct(value: &str) -> String {
    value.trim().trim_end_matches(|c: char| c == ',' || c == '.' || c == ';' || c == ':').trim().to_string()
}

fn has_zip(value: &str) -> bool {
    Regex::new(r"\b\d{5}\b").ok().map_or(false, |re| re.is_match(value))
}

fn append_zip(value: &str, zip: &str) -> String {
    let mut out = value.trim().to_string();
    if !out.ends_with(' ') {
        out.push(' ');
    }
    out.push_str(zip);
    out
}

fn find_zip_after_label(text: &str, labels: &[&str]) -> Option<String> {
    let re_zip = Regex::new(r"\b(\d{5})\b").ok()?;
    let lines: Vec<&str> = text.lines().collect();
    for i in 0..lines.len() {
        let lower = lines[i].to_lowercase();
        if labels.iter().any(|label| lower.contains(&label.to_lowercase())) {
            if let Some(caps) = re_zip.captures(lines[i]) {
                return Some(caps.get(1)?.as_str().to_string());
            }
            let max_idx = std::cmp::min(i + 3, lines.len());
            for j in (i + 1)..max_idx {
                if let Some(caps) = re_zip.captures(lines[j]) {
                    return Some(caps.get(1)?.as_str().to_string());
                }
            }
        }
    }
    None
}

fn normalize_time(raw: &str) -> String {
    let compact = raw.trim().replace(' ', "");
    if compact.ends_with("AM") || compact.ends_with("PM") {
        let (time, meridiem) = compact.split_at(compact.len() - 2);
        format!("{time} {meridiem}")
    } else {
        raw.trim().to_string()
    }
}

fn extract_time(value: &str) -> Option<String> {
    let value = value.replace('.', ":").replace('-', ":");
    let re = Regex::new(r"\b(\d{1,2}[:\s]\d{2}\s*(AM|PM))\b").ok()?;
    if let Some(caps) = re.captures(&value) {
        return caps.get(1).map(|m| normalize_time(m.as_str()));
    }
    let re2 = Regex::new(r"\b(\d{1,2})\D(\d{2})\s*([AP]M)\b").ok()?;
    re2.captures(&value)
        .map(|caps| format!("{}:{} {}", &caps[1], &caps[2], &caps[3]))
}

fn extract_pta_from_text(text: &str) -> Option<String> {
    for line in text.lines() {
        if line.to_lowercase().contains("pta") {
            if let Some(time) = extract_time(line) {
                return Some(time);
            }
        }
    }
    None
}

fn capture_label(text: &str, label: &str) -> Option<String> {
    let pattern = format!(r"(?i){}\s*[:\\-\\.]?\s*([^\n\r]+)", regex::escape(label));
    let re = Regex::new(&pattern).ok()?;
    re.captures(text)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().trim().to_string()))
}

fn capture_label_any(text: &str, labels: &[&str]) -> Option<String> {
    for label in labels {
        if let Some(value) = capture_label(text, label) {
            return Some(value);
        }
    }
    None
}

fn parse_call_number(text: &str) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    for (idx, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        let looks_like_call_label = lower.contains("call")
            && (lower.contains('#')
                || lower.contains(" no")
                || lower.contains("number")
                || lower.contains(" id")
                || lower.contains(" 1d"));
        if !looks_like_call_label {
            continue;
        }
        let same_line_digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
        if same_line_digits.len() >= 4 {
            return Some(same_line_digits);
        }
        for next in lines.iter().skip(idx + 1).take(2) {
            let next_digits: String = next.chars().filter(|c| c.is_ascii_digit()).collect();
            if next_digits.len() >= 4 {
                return Some(next_digits);
            }
        }
    }

    let label_re = Regex::new(r"(?i)\bcall\s*(#|no\.?|number|id)\b").ok();
    for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("call type") || lower.contains("phone") || lower.contains("contact") {
            continue;
        }
        if let Some(re) = &label_re {
            if re.is_match(&lower) {
                let digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
                if digits.len() >= 4 {
                    return Some(digits);
                }
            }
        }
    }
    if let Some(line) = text.lines().find(|line| line.to_lowercase().contains("sa-") || line.to_lowercase().contains("sa ")) {
        let re_pair = Regex::new(r"(?i)\bW?S\s*A[-\s]?\d+\D+(\d{5,})\b").ok();
        if let Some(re_pair) = re_pair {
            if let Some(caps) = re_pair.captures(line) {
                return Some(caps.get(1)?.as_str().to_string());
            }
        }
        let re = Regex::new(r"/\s*(\d{5,})\b").ok()?;
        if let Some(caps) = re.captures(line) {
            return Some(caps.get(1)?.as_str().to_string());
        }
    }
    if let Some(line) = text.lines().find(|line| line.to_lowercase().contains("sa")) {
        let re = Regex::new(r"(?i)\bW?SA\D*\d+\D+(\d{5,})\b").ok()?;
        if let Some(caps) = re.captures(line) {
            return Some(caps.get(1)?.as_str().to_string());
        }
    }
    if let Some(line) = text.lines().find(|line| line.to_lowercase().contains("dispatched")) {
        let re = Regex::new(r"(?i)\bS\s*A[-\s]?\d+\D+(\d{5,})\b").ok()?;
        if let Some(caps) = re.captures(line) {
            return Some(caps.get(1)?.as_str().to_string());
        }
    }
    let re_sa = Regex::new(r"\bSA-\d+\s*/\s*(\d{5,})\b").ok()?;
    if let Some(caps) = re_sa.captures(text) {
        return Some(caps.get(1)?.as_str().to_string());
    }
    let re_slash = Regex::new(r"/\s*(\d{5,})\b").ok()?;
    if let Some(caps) = re_slash.captures(text) {
        return Some(caps.get(1)?.as_str().to_string());
    }
    let re = Regex::new(r"\b[A-Z]{2}-\d+\s*/\s*(\d{6,})\b").ok()?;
    if let Some(caps) = re.captures(text) {
        return Some(caps.get(1)?.as_str().to_string());
    }
    if let Some(label) = capture_label(text, "CALL #") {
        let digits = Regex::new(r"\b(\d{4,})\b").ok()?;
        if let Some(caps) = digits.captures(&label) {
            return Some(caps.get(1)?.as_str().to_string());
        }
        let only_digits: String = label.chars().filter(|c| c.is_ascii_digit()).collect();
        if only_digits.len() >= 4 {
            return Some(only_digits);
        }
    }
    if let Some(label) = capture_label_any(text, &["Call Number", "Call No", "Call ID", "Call #", "Call"]) {
        let digits = Regex::new(r"\b(\d{4,})\b").ok()?;
        if let Some(caps) = digits.captures(&label) {
            return Some(caps.get(1)?.as_str().to_string());
        }
        let only_digits: String = label.chars().filter(|c| c.is_ascii_digit()).collect();
        if only_digits.len() >= 4 {
            return Some(only_digits);
        }
    }
    for line in text.lines() {
        if line.to_lowercase().contains("call") {
            let only_digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
            if only_digits.len() >= 6 {
                return Some(only_digits);
            }
        }
    }
    let re2 = Regex::new(r"/\s*(\d{6,})").ok()?;
    if let Some(caps) = re2.captures(text) {
        return Some(caps.get(1)?.as_str().to_string());
    }
    let re3 = Regex::new(r"\b(\d{6,})\b").ok()?;
    re3.captures(text).and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
}

fn parse_travel_minutes(text: &str) -> Option<String> {
    let re = Regex::new(r"(Travel to|Travel from)\s*(\d+\s*Minutes?)").ok()?;
    re.captures(text).and_then(|caps| caps.get(2).map(|m| m.as_str().to_string()))
}

fn label_fuzzy_match(text: &str, label: &str) -> bool {
    if text.is_empty() || label.is_empty() {
        return false;
    }
    let a: Vec<char> = text.chars().collect();
    let b: Vec<char> = label.chars().collect();
    let n = a.len();
    let m = b.len();
    if m == 0 {
        return true;
    }
    let mut dp = vec![0usize; m + 1];
    for j in 0..=m {
        dp[j] = j;
    }
    for i in 1..=n {
        let mut prev = dp[0];
        dp[0] = i;
        for j in 1..=m {
            let temp = dp[j];
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            dp[j] = std::cmp::min(
                std::cmp::min(dp[j] + 1, dp[j - 1] + 1),
                prev + cost,
            );
            prev = temp;
        }
    }
    let distance = dp[m];
    let threshold = if m <= 6 { 1 } else if m <= 10 { 2 } else { 3 };
    distance <= threshold
}

fn capture_label_fuzzy(text: &str, label: &str) -> Option<String> {
    let normalized_label: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace() || *c == '&')
        .collect::<String>()
        .to_lowercase();
    for line in text.lines() {
        let cleaned: String = line
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c.is_whitespace() || c == '&' { c } else { ' ' })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if cleaned.len() < normalized_label.len().saturating_sub(2) {
            continue;
        }
        if cleaned.contains(&normalized_label) || label_fuzzy_match(&cleaned, &normalized_label) {
            let pattern = format!(r"(?i){}\s*[:\\-\\.]?\s*(.+)$", regex::escape(label));
            if let Ok(re) = Regex::new(&pattern) {
                if let Some(caps) = re.captures(line) {
                    if let Some(value) = caps.get(1) {
                        return Some(value.as_str().trim().to_string());
                    }
                }
            }
            if let Some(idx) = cleaned.find(&normalized_label) {
                let original = line;
                let raw = original.get(idx + label.len()..).unwrap_or("").trim();
                if !raw.is_empty() {
                    return Some(raw.to_string());
                }
            }
        }
    }
    None
}

fn parse_fields(text: &str) -> ParsedFields {
    let clean_work_type = |raw: &str| {
        let cleaned = clean_value(raw);
        let mut parts: Vec<String> = Vec::new();
        for part in cleaned.split_whitespace() {
            if part.is_empty() {
                continue;
            }
            parts.push(part.to_string());
            if parts.len() >= 4 {
                break;
            }
        }
        parts.join(" ").trim().to_string()
    };

    let mut work_type_id = capture_label_any(
        text,
        &["Work Type ID", "Work Type 1D", "Work Type lD", "WorkTypeID", "Work Type"],
    )
        .map(|v| clean_work_type(&v))
        .filter(|value| !value.is_empty());
    let mut vehicle_name = parse_vehicle_name(text);
    let mut street_city = parse_street_city(text);
    let mut pta = capture_label(text, "PTA").and_then(|v| extract_time(&v));
    let mut contact_id = capture_label(text, "Contact ID")
        .map(|v| normalize_name_spacing(&clean_words(&v, 2)))
        .filter(|value| !value.is_empty());
    if contact_id.is_none() {
        if let Some(value) = capture_label_fuzzy(text, "Contact ID") {
            contact_id = Some(normalize_name_spacing(&clean_words(&value, 2)));
        }
    }
    if contact_id.is_none() {
        if let Some(value) = capture_label_fuzzy(text, "AAA ID") {
            contact_id = Some(normalize_name_spacing(&clean_words(&value, 2)));
        }
    }
    let mut phone_number = capture_label(text, "Phone Number").and_then(|v| {
        let re = Regex::new(r"\(?(\d{3})\)?\D*(\d{3})\D*(\d{4})").ok()?;
        re.captures(&v).map(|caps| format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]))
    });
    let mut membership_level = capture_label(text, "Member Benefit Level").map(|v| clean_value(&v));

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if work_type_id.is_none() {
            if let Some(value) = line_value(trimmed, "Work Type ID") {
                work_type_id = Some(clean_work_type(&value));
            }
            if work_type_id.is_none() {
                if let Some(value) = capture_label_fuzzy(trimmed, "Work Type ID") {
                    work_type_id = Some(clean_work_type(&value));
                }
            }
            if work_type_id.is_none() {
                if let Some(value) = line_value(trimmed, "Work Type 1D")
                    .or_else(|| line_value(trimmed, "Work Type lD"))
                    .or_else(|| line_value(trimmed, "WorkTypeID"))
                    .or_else(|| line_value(trimmed, "Work Type"))
                {
                    work_type_id = Some(clean_work_type(&value));
                }
            }
        }
        if vehicle_name.is_none() {
            if let Some(value) = line_value(trimmed, "Member Vehicle Name") {
                vehicle_name = Some(clean_vehicle(&value));
            } else if let Some(value) = line_value(trimmed, "Member Vehicle") {
                vehicle_name = Some(clean_vehicle(&value));
            } else if let Some(value) = line_value(trimmed, "Vehicle Name") {
                vehicle_name = Some(clean_vehicle(&value));
            } else if let Some(value) = line_value(trimmed, "Vehicle") {
                vehicle_name = Some(clean_vehicle(&value));
            }
        }
        if street_city.is_none() {
            if let Some(value) = line_value(trimmed, "Street & City") {
                street_city = Some(clean_street_city(&value));
            }
        }
        if pta.is_none() {
            if let Some(value) = line_value(trimmed, "PTA") {
                pta = extract_time(&value);
            }
        }
        if contact_id.is_none() {
            if let Some(value) = line_value(trimmed, "Contact ID") {
                contact_id = Some(clean_words(&value, 3));
            }
        }
        if phone_number.is_none() {
            if let Some(value) = line_value(trimmed, "Phone Number") {
                let re = Regex::new(r"\(?(\d{3})\)?\D*(\d{3})\D*(\d{4})").ok();
                phone_number = re.and_then(|re| {
                    re.captures(&value)
                        .map(|caps| format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]))
                });
            }
        }
        if membership_level.is_none() {
            if let Some(value) = line_value(trimmed, "Member Benefit Level") {
                membership_level = Some(clean_value(&value));
            }
        }
    }

    let membership_level = membership_level
        .and_then(|value| normalize_membership_level(&value))
        .or_else(|| normalize_membership_level(text));
    let work_type_id = work_type_id.or_else(|| {
        let lower = text.to_lowercase();
        if lower.contains("passenger") && lower.contains("tow") {
            Some("Passenger Car Tow".to_string())
        } else {
            None
        }
    });
    let pta = pta
        .or_else(|| extract_pta_from_text(text))
        .or_else(|| extract_time(text));
    let phone_number = phone_number.or_else(|| {
        let re = Regex::new(r"\(?(\d{3})\)?\D*(\d{3})\D*(\d{4})").ok()?;
        re.captures(text)
            .map(|caps| format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]))
    });
    if let Some(value) = &street_city {
        if !has_zip(value) {
            if let Some(zip) = find_zip_after_label(text, &["Street & City", "Pickup", "Pick Up", "Pick-Up"]) {
                street_city = Some(append_zip(value, &zip));
            }
        }
    }

    ParsedFields {
        call_number: parse_call_number(text),
        work_type_id,
        vehicle_name,
        membership_level,
        street_city,
        pta,
        contact_id,
        phone_number,
        in_tow_eta: parse_travel_minutes(text),
    }
}

fn parse_vehicle_name(text: &str) -> Option<String> {
    let labels = [
        "Member Vehicle Name",
        "Member Vehicle",
        "Vehicle Name",
        "Vehicle",
    ];
    if let Some(value) = capture_label_any(text, &labels) {
        let cleaned = clean_vehicle(&value);
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    let lines: Vec<&str> = text.lines().collect();
    for (idx, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        if lower.contains("vehicle") {
            let re = Regex::new(
                r"(?i)\bmember\s*vehicle(?:\s*name)?\b\s*[:\\-\\.]?\s*(.+)$",
            )
            .ok();
            if let Some(re) = re {
                if let Some(caps) = re.captures(line) {
                    let value = caps.get(1).map(|m| m.as_str()).unwrap_or("").trim();
                    if !value.is_empty() {
                        return Some(clean_vehicle(value));
                    }
                }
            }
            let re2 = Regex::new(r"(?i)\bvehicle(?:\s*name)?\b\s*[:\\-\\.]?\s*(.+)$").ok();
            if let Some(re2) = re2 {
                if let Some(caps) = re2.captures(line) {
                    let value = caps.get(1).map(|m| m.as_str()).unwrap_or("").trim();
                    if !value.is_empty() {
                        return Some(clean_vehicle(value));
                    }
                }
            }
            // If label line has no value, look to next line for it.
            if idx + 1 < lines.len() {
                let next = lines[idx + 1].trim();
                if !next.is_empty() {
                    return Some(clean_vehicle(next));
                }
            }
        }
    }
    // Fallback: pick a line that looks like a vehicle description.
    for line in lines.iter() {
        let lower = line.to_lowercase();
        if lower.contains("jeep") || lower.contains("liberty") || lower.contains("toyota") || lower.contains("honda") {
            let cleaned = clean_vehicle(line);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
        if Regex::new(r"\b(19|20)\d{2}\b").ok().map_or(false, |re| re.is_match(line))
            && Regex::new(r"\b(car|truck|van|suv)\b").ok().map_or(false, |re| re.is_match(&lower))
        {
            let cleaned = clean_vehicle(line);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    None
}

fn parse_street_city_only(text: &str) -> Option<String> {
    let mut street_city = parse_street_city(text);
    if let Some(value) = &street_city {
        if !has_zip(value) {
            if let Some(zip) = find_zip_after_label(text, &["Street & City", "Drop Off", "Dropoff", "Destination"]) {
                street_city = Some(append_zip(value, &zip));
            }
        }
    }
    street_city
}

fn is_phone_like(value: &str) -> bool {
    Regex::new(r"\b\(?\d{3}\)?\D*\d{3}\D*\d{4}\b|\b\d{7}\b")
        .ok()
        .map_or(false, |re| re.is_match(value))
}

fn is_address_like(value: &str) -> bool {
    let lower = value.to_lowercase();
    let has_number = Regex::new(r"\b\d{1,5}\b")
        .ok()
        .map_or(false, |re| re.is_match(&lower));
    let has_zip = Regex::new(r"\b\d{5}\b")
        .ok()
        .map_or(false, |re| re.is_match(&lower));
    let has_suffix = Regex::new(r"\b(st|ave|blvd|rd|dr|ln|ct|way|pl|plz|hwy|pkwy|cir|ter|trl)\b")
        .ok()
        .map_or(false, |re| re.is_match(&lower));
    let has_state_zip = Regex::new(r"\b[A-Z]{2}\s+\d{5}\b")
        .ok()
        .map_or(false, |re| re.is_match(value));
    let has_intersection = lower.contains(" & ") || lower.contains(" and ");
    (has_number && has_suffix) || has_state_zip || (has_number && has_zip) || has_intersection
}

fn is_bad_address_candidate(value: &str) -> bool {
    let lower = value.to_lowercase();
    if lower.contains("phone") || lower.contains("number") {
        return true;
    }
    if is_phone_like(value) && !is_address_like(value) {
        return true;
    }
    if Regex::new(r"\b\d{6,}\b").ok().map_or(false, |re| re.is_match(value))
        && !is_address_like(value)
    {
        return true;
    }
    false
}

fn parse_street_city(text: &str) -> Option<String> {
    let labels = [
        "Street & City",
        "Drop Off",
        "Dropoff",
        "Drop Off Address",
        "Destination",
    ];
    let mut street_city = capture_label_any(text, &labels).map(|v| clean_street_city(&v));
    if street_city.is_none() {
        if let Some(value) = capture_label_fuzzy(text, "Street & City") {
            street_city = Some(clean_street_city(&value));
        }
    }
    if let Some(value) = &street_city {
        if is_bad_address_candidate(value) || !is_address_like(value) {
            street_city = None;
        }
    }
    if street_city.is_some() {
        return street_city;
    }

    let lines: Vec<&str> = text.lines().collect();
    for (idx, line) in lines.iter().enumerate() {
        let lower = line.to_lowercase();
        if labels.iter().any(|label| lower.contains(&label.to_lowercase())) {
            let candidates = [
                line.trim(),
                if idx > 0 { lines[idx - 1].trim() } else { "" },
                if idx + 1 < lines.len() { lines[idx + 1].trim() } else { "" },
                if idx + 2 < lines.len() { lines[idx + 2].trim() } else { "" },
            ];
            for candidate in candidates {
                if candidate.is_empty() {
                    continue;
                }
                let cleaned = clean_street_city(candidate);
                if is_bad_address_candidate(&cleaned) {
                    continue;
                }
                if is_address_like(&cleaned) {
                    return Some(cleaned);
                }
            }
        }
    }
    // Try to join split address lines (street line + city/state line).
    for (idx, line) in lines.iter().enumerate() {
        let cleaned = clean_street_city(line);
        if cleaned.is_empty() || is_bad_address_candidate(&cleaned) {
            continue;
        }
        let lower = cleaned.to_lowercase();
        let looks_like_street = lower.contains(" st")
            || lower.contains(" rd")
            || lower.contains(" dr")
            || lower.contains(" ave")
            || lower.contains(" blvd")
            || lower.contains(" ct")
            || lower.contains(" ln")
            || lower.contains(" way")
            || lower.contains(" hwy")
            || lower.contains(" pkwy")
            || lower.contains(" cir")
            || lower.contains(" ter")
            || lower.contains(" trl")
            || lower.contains(" & ");
        if looks_like_street && idx + 1 < lines.len() {
            let next = clean_street_city(lines[idx + 1]);
            if !next.is_empty() && !is_bad_address_candidate(&next) {
                let joined = format!("{} {}", cleaned, next);
                if is_address_like(&joined) {
                    return Some(joined);
                }
            }
        }
    }
    find_best_address_line(text)
}

fn find_best_address_line(text: &str) -> Option<String> {
    let mut best: Option<String> = None;
    let mut best_score = -1;
    for line in text.lines() {
        let cleaned = clean_street_city(line);
        if cleaned.is_empty() || is_bad_address_candidate(&cleaned) {
            continue;
        }
        if !is_address_like(&cleaned) {
            continue;
        }
        let mut score = 0;
        if Regex::new(r"\b\d{1,5}\b").ok().map_or(false, |re| re.is_match(&cleaned)) {
            score += 2;
        }
        if Regex::new(r"\b\d{5}\b").ok().map_or(false, |re| re.is_match(&cleaned)) {
            score += 3;
        }
        if Regex::new(r"\b[A-Z]{2}\s+\d{5}\b").ok().map_or(false, |re| re.is_match(&cleaned)) {
            score += 3;
        }
        if Regex::new(r"\b(st|ave|blvd|rd|dr|ln|ct|way|pl|plz|hwy|pkwy|cir|ter|trl)\b")
            .ok()
            .map_or(false, |re| re.is_match(&cleaned.to_lowercase()))
        {
            score += 2;
        }
        if score > best_score {
            best_score = score;
            best = Some(cleaned);
        }
    }
    best
}

fn normalize_membership_level(raw: &str) -> Option<String> {
    let lower = raw.to_lowercase();
    if lower.contains("pius") || lower.contains("plu5") {
        return Some("Plus (100 miles)".to_string());
    }
    if lower.contains("classic") {
        return Some("Classic (7 miles)".to_string());
    }
    if lower.contains("plus") {
        return Some("Plus (100 miles)".to_string());
    }
    if lower.contains("premier") {
        return Some("Premier (200 miles)".to_string());
    }
    if lower.contains("promier") {
        return Some("Premier (200 miles)".to_string());
    }
    if raw.trim().is_empty() {
        None
    } else {
        Some(raw.trim().to_string())
    }
}

#[tauri::command]
pub async fn ocr_import_image_b64(
    app: AppHandle,
    db: State<'_, DbState>,
    template_type: String,
    image_b64: String,
) -> Result<OcrImportPreview, String> {
    if template_type != "ACE_PICKUP" && template_type != "ACE_DROPOFF" {
        return Err("Invalid template_type".to_string());
    }
    let custom_path = load_tesseract_path(&db);
    let bundled_paths = bundled_tesseract_paths(&app);
    let (exe_path, tessdata_path) = if let Some(path) = custom_path.clone() {
        (Some(path), None)
    } else if let Some((exe, tessdata)) = bundled_paths {
        (Some(exe), Some(tessdata))
    } else {
        (None, None)
    };
    ensure_ocr_available(exe_path.as_deref(), tessdata_path.as_deref())?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let root_dir = app_dir.join("DispatcherOne");
    let image_dir = root_dir.join("ocr_images");
    ensure_dir(&image_dir)?;
    let raw = strip_data_prefix(&image_b64);
    let bytes = BASE64_STD.decode(raw.as_bytes()).map_err(|e| e.to_string())?;
    if bytes.len() > 6_000_000 {
        return Err("Image too large. Please use a smaller PNG/JPG.".to_string());
    }

    let file_id = format!("ocr_{}.png", Uuid::new_v4());
    let image_path = image_dir.join(file_id);
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;

    let image_path_for_ocr = maybe_convert_heic_to_png(&image_path)?;
    let is_dropoff = template_type == "ACE_DROPOFF";
    let fast_variants = build_ocr_variants(&image_path_for_ocr, false, if is_dropoff { 1400 } else { 1600 });
    let fast_variants_for_ocr = fast_variants.clone();
    let exe_path_fast = exe_path.clone();
    let tessdata_fast = tessdata_path.clone();
    let raw_text = tauri::async_runtime::spawn_blocking(move || {
        run_platform_ocr_variants(
            &fast_variants_for_ocr,
            exe_path_fast.as_deref(),
            tessdata_fast.as_deref(),
        )
    })
        .await
        .map_err(|_| "OCR task failed".to_string())??;
    let mut raw_text = raw_text;
    if !is_dropoff {
        let raw_score = score_text(&raw_text);
        if raw_score < 8 {
            let full_variants = build_ocr_variants(&image_path_for_ocr, true, 2200);
            let full_variants_for_ocr = full_variants.clone();
            let exe_path_full = exe_path.clone();
            let tessdata_full = tessdata_path.clone();
            let full_text = tauri::async_runtime::spawn_blocking(move || {
                run_platform_ocr_variants(
                    &full_variants_for_ocr,
                    exe_path_full.as_deref(),
                    tessdata_full.as_deref(),
                )
            })
                .await
                .map_err(|_| "OCR task failed".to_string())??;
            let full_score = score_text(&full_text);
            if full_score > raw_score {
                raw_text = full_text;
            }
        }
    }

    if is_dropoff && raw_text.len() > 10_000 {
        raw_text.truncate(10_000);
    }
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    build_preview(&conn, template_type, &image_path, raw_text)
}

#[tauri::command]
pub async fn ocr_import_image_path(
    app: AppHandle,
    db: State<'_, DbState>,
    template_type: String,
    file_path: String,
) -> Result<OcrImportPreview, String> {
    if template_type != "ACE_PICKUP" && template_type != "ACE_DROPOFF" {
        return Err("Invalid template_type".to_string());
    }
    let custom_path = load_tesseract_path(&db);
    let bundled_paths = bundled_tesseract_paths(&app);
    let (exe_path, tessdata_path) = if let Some(path) = custom_path.clone() {
        (Some(path), None)
    } else if let Some((exe, tessdata)) = bundled_paths {
        (Some(exe), Some(tessdata))
    } else {
        (None, None)
    };
    ensure_ocr_available(exe_path.as_deref(), tessdata_path.as_deref())?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let root_dir = app_dir.join("DispatcherOne");
    let image_dir = root_dir.join("ocr_images");
    ensure_dir(&image_dir)?;

    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;
    if bytes.len() > 6_000_000 {
        return Err("Image too large. Please use a smaller PNG/JPG.".to_string());
    }

    let extension = PathBuf::from(&file_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| "png".to_string());
    let file_id = format!("ocr_{}.{}", Uuid::new_v4(), extension);
    let image_path = image_dir.join(file_id);
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;

    let image_path_for_ocr = maybe_convert_heic_to_png(&image_path)?;
    let is_dropoff = template_type == "ACE_DROPOFF";
    let fast_variants = build_ocr_variants(&image_path_for_ocr, false, if is_dropoff { 1400 } else { 1600 });
    let fast_variants_for_ocr = fast_variants.clone();
    let exe_path_fast = exe_path.clone();
    let tessdata_fast = tessdata_path.clone();
    let raw_text = tauri::async_runtime::spawn_blocking(move || {
        run_platform_ocr_variants(
            &fast_variants_for_ocr,
            exe_path_fast.as_deref(),
            tessdata_fast.as_deref(),
        )
    })
        .await
        .map_err(|_| "OCR task failed".to_string())??;
    let mut raw_text = raw_text;
    if !is_dropoff {
        let raw_score = score_text(&raw_text);
        if raw_score < 8 {
            let full_variants = build_ocr_variants(&image_path_for_ocr, true, 2200);
            let full_variants_for_ocr = full_variants.clone();
            let exe_path_full = exe_path.clone();
            let tessdata_full = tessdata_path.clone();
            let full_text = tauri::async_runtime::spawn_blocking(move || {
                run_platform_ocr_variants(
                    &full_variants_for_ocr,
                    exe_path_full.as_deref(),
                    tessdata_full.as_deref(),
                )
            })
                .await
                .map_err(|_| "OCR task failed".to_string())??;
            let full_score = score_text(&full_text);
            if full_score > raw_score {
                raw_text = full_text;
            }
        }
    }

    if is_dropoff && raw_text.len() > 10_000 {
        raw_text.truncate(10_000);
    }
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    build_preview(&conn, template_type, &image_path, raw_text)
}

#[tauri::command]
pub async fn ocr_capture_screenshot(
    app: AppHandle,
    db: State<'_, DbState>,
    template_type: String,
) -> Result<OcrImportPreview, String> {
    if template_type != "ACE_PICKUP" && template_type != "ACE_DROPOFF" {
        return Err("Invalid template_type".to_string());
    }
    let custom_path = load_tesseract_path(&db);
    let bundled_paths = bundled_tesseract_paths(&app);
    let (exe_path, tessdata_path) = if let Some(path) = custom_path.clone() {
        (Some(path), None)
    } else if let Some((exe, tessdata)) = bundled_paths {
        (Some(exe), Some(tessdata))
    } else {
        (None, None)
    };
    ensure_ocr_available(exe_path.as_deref(), tessdata_path.as_deref())?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let root_dir = app_dir.join("DispatcherOne");
    let image_dir = root_dir.join("ocr_images");
    ensure_dir(&image_dir)?;

    let file_id = format!("capture_{}.png", Uuid::new_v4());
    let image_path = image_dir.join(file_id);

    #[cfg(target_os = "windows")]
    {
        let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$Path = $env:OCR_CAPTURE_PATH
if ([string]::IsNullOrWhiteSpace($Path)) { Write-Error "Missing capture path." ; exit 1 }
Set-Clipboard -Value $null
Start-Process "ms-screenclip:"
$timeoutSeconds = 20
$elapsed = 0
while ($elapsed -lt $timeoutSeconds) {
  try {
    $img = Get-Clipboard -Format Image -ErrorAction Stop
    if ($null -ne $img) {
      $img.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
      [Console]::Out.Write("OK")
      exit 0
    }
  } catch {
    # ignore until clipboard has an image
  }
  Start-Sleep -Milliseconds 500
  $elapsed += 0.5
}
Write-Error "Screenshot capture timed out."
exit 1
"#;
        let mut cmd = Command::new("powershell");
        cmd.arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-STA")
            .arg("-Command")
            .arg(script)
            .env("OCR_CAPTURE_PATH", &image_path);
        #[cfg(target_os = "windows")]
        {
            hide_windows_console(&mut cmd);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to start Windows Snipping Tool: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let message = if stderr.is_empty() { "Screenshot cancelled".to_string() } else { stderr };
            return Err(message);
        }
        if !image_path.exists() {
            return Err("Screenshot not saved".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("screencapture")
            .arg("-i")
            .arg("-s")
            .arg(&image_path)
            .status()
            .map_err(|e| format!("Failed to start screencapture: {e}"))?;
        if !status.success() {
            return Err("Screenshot cancelled".to_string());
        }
        if !image_path.exists() {
            return Err("Screenshot not saved".to_string());
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err("Screenshot capture not supported on this platform. Please use 'Upload Pickup Screenshot' instead.".to_string());
    }

    let image_path_for_ocr = maybe_convert_heic_to_png(&image_path)?;
    let is_dropoff = template_type == "ACE_DROPOFF";
    let fast_variants = build_ocr_variants(&image_path_for_ocr, false, if is_dropoff { 1400 } else { 1600 });
    let fast_variants_for_ocr = fast_variants.clone();
    let exe_path_fast = exe_path.clone();
    let tessdata_fast = tessdata_path.clone();
    let raw_text = tauri::async_runtime::spawn_blocking(move || {
        run_platform_ocr_variants(
            &fast_variants_for_ocr,
            exe_path_fast.as_deref(),
            tessdata_fast.as_deref(),
        )
    })
        .await
        .map_err(|_| "OCR task failed".to_string())??;
    let mut raw_text = raw_text;
    if !is_dropoff {
        let raw_score = score_text(&raw_text);
        if raw_score < 8 {
            let full_variants = build_ocr_variants(&image_path_for_ocr, true, 2200);
            let full_variants_for_ocr = full_variants.clone();
            let exe_path_full = exe_path.clone();
            let tessdata_full = tessdata_path.clone();
            let full_text = tauri::async_runtime::spawn_blocking(move || {
                run_platform_ocr_variants(
                    &full_variants_for_ocr,
                    exe_path_full.as_deref(),
                    tessdata_full.as_deref(),
                )
            })
                .await
                .map_err(|_| "OCR task failed".to_string())??;
            let full_score = score_text(&full_text);
            if full_score > raw_score {
                raw_text = full_text;
            }
        }
    }

    if is_dropoff && raw_text.len() > 10_000 {
        raw_text.truncate(10_000);
    }
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    build_preview(&conn, template_type, &image_path, raw_text)
}

#[tauri::command]
pub fn ocr_create_call(
    db: State<'_, DbState>,
    import_id: String,
    mut payload: CallCreatePayload,
) -> Result<String, String> {
    if payload.created_via.trim().is_empty() {
        payload.created_via = "OCR".to_string();
    }
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let call_id = calls_repo::call_create(&mut conn, payload).map_err(|e| e.to_string())?;
    ocr_repo::ocr_import_attach_call(&conn, &import_id, &call_id).map_err(|e| e.to_string())?;
    Ok(call_id)
}

#[tauri::command]
pub fn ocr_attach_call(
    db: State<'_, DbState>,
    import_id: String,
    call_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    ocr_repo::ocr_import_attach_call(&conn, &import_id, &call_id).map_err(|e| e.to_string())?;
    Ok(())
}
