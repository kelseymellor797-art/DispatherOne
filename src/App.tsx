import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, LogicalPosition, LogicalSize, monitorFromPoint, primaryMonitor } from "@tauri-apps/api/window";
type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type Tab = {
  id: string;
  label: string;
  icon: JSX.Element;
};

type CallStatus =
  | "ACTIVE"
  | "PENDING"
  | "ASSIGNED"
  | "EN_ROUTE"
  | "94"
  | "95"
  | "97"
  | "IN_TOW"
  | "98";

type DashboardSettings = {
  width_percent?: number | null;
  dock_side?: string | null;
  always_on_top?: boolean | null;
  alerts_interval_minutes?: number | null;
};

type CallSummary = {
  call_id: string;
  external_call_number?: string | null;
  source_type: string;
  law_agency?: string | null;
  pickup_address: string;
  dropoff_address?: string | null;
  status: string;
  status_updated_at: string;
  created_at: string;
  membership_level?: string | null;
  contact_id?: string | null;
  callback_phone?: string | null;
  vehicle_description?: string | null;
  notes?: string | null;
  pricing_total?: number | null;
  pricing_notes?: string | null;
};

type CallRecord = {
  id: string;
  external_call_number?: string | null;
  source_type: string;
  law_agency?: string | null;
  pickup_address: string;
  dropoff_address?: string | null;
  pickup_notes?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  callback_phone?: string | null;
  vehicle_description?: string | null;
  membership_level?: string | null;
  status: string;
  status_updated_at: string;
  created_via: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  outcome?: string | null;
  pricing_category: string;
  pricing_total?: number | null;
  pricing_notes?: string | null;
  notes?: string | null;
  priority_group?: string | null;
};

type CallDetail = {
  call: CallRecord;
  assignments: {
    id: string;
    driver_id: string;
    state: string;
    queue_position?: number | null;
    manual_sort_key?: number | null;
    assigned_at?: string | null;
    activated_at?: string | null;
    ended_at?: string | null;
  }[];
};

type CallHistoryItem = {
  call_id: string;
  external_call_number?: string | null;
  source_type: string;
  law_agency?: string | null;
  pickup_address: string;
  dropoff_address?: string | null;
  status: string;
  status_updated_at: string;
  created_at: string;
  closed_at?: string | null;
  outcome?: string | null;
  contact_name?: string | null;
  callback_phone?: string | null;
  membership_level?: string | null;
  pricing_total?: number | null;
  notes?: string | null;
  driver_name?: string | null;
};

type CurrentTruck = {
  truck_number: string;
  truck_type?: string | null;
  assigned_at: string;
};

type DriverDashboardItem = {
  driver_id: string;
  display_name: string;
  availability_status: string;
  availability_updated_at: string;
  phone?: string | null;
  capabilities?: string | null;
  notes?: string | null;
  last_location?: string | null;
  last_location_updated_at?: string | null;
  created_at: string;
  updated_at: string;
  today_shift_start?: string | null;
  current_truck?: CurrentTruck | null;
  active_call?: CallSummary | null;
  pending_queue: CallSummary[];
};

type DashboardSnapshot = {
  drivers: DriverDashboardItem[];
  unassigned_calls: CallSummary[];
  settings: DashboardSettings;
};

type SearchDriverHit = {
  driver_id: string;
  display_name: string;
  availability_status: string;
  phone?: string | null;
  is_active: boolean;
};

type SearchCallHit = {
  call_id: string;
  external_call_number?: string | null;
  source_type: string;
  law_agency?: string | null;
  pickup_address: string;
  dropoff_address?: string | null;
  status: string;
  status_updated_at: string;
};

type SearchResults = {
  drivers: SearchDriverHit[];
  calls: SearchCallHit[];
};

type AaaMemberCall = {
  call_id: string;
  external_call_number?: string | null;
  source_type: string;
  membership_level?: string | null;
  contact_name?: string | null;
  callback_phone?: string | null;
  notes?: string | null;
  pricing_notes?: string | null;
  driver_name?: string | null;
  pickup_notes?: string | null;
  contact_id?: string | null;
  pickup_address: string;
  dropoff_address?: string | null;
  status: string;
  status_updated_at: string;
  outcome?: string | null;
  closed_at?: string | null;
};

type AaaMemberRow = {
  id: string;
  calledMember: boolean;
  timestamp: string | null;
  notes: string;
};

type DriverRecord = {
  id: string;
  display_name: string;
  availability_status: string;
  availability_updated_at: string;
  phone?: string | null;
  capabilities?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type DriverShiftRecord = {
  id: string;
  driver_id: string;
  shift_start: string;
  lunch_start: string;
  lunch_end: string;
  shift_end: string;
  shift_label?: string | null;
  is_cancelled: boolean;
  created_at: string;
  updated_at: string;
};

type DriverCallReportItem = {
  driver_id: string;
  call_id: string;
  outcome: string;
  closed_at: string;
  source_type: string;
  external_call_number?: string | null;
  en_route_at?: string | null;
};

type EventLogItem = {
  id: string;
  timestamp: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  metadata_json?: string | null;
  call_number?: string | null;
  call_source_type?: string | null;
  call_pickup?: string | null;
  driver_name?: string | null;
};

type DriverCardDraft = {
  displayName: string;
  status: string;
  shiftStart: string;
  shiftEnd: string;
  lunchStart: string;
  lunchEnd: string;
  truckNumber: string;
};

type OcrImportPreview = {
  import_id: string;
  template_type: string;
  raw_text: string;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  confidence: number;
  call_number?: string | null;
  work_type_id?: string | null;
  vehicle_name?: string | null;
  membership_level?: string | null;
  pta?: string | null;
  contact_id?: string | null;
  phone_number?: string | null;
  in_tow_eta?: string | null;
};
type OcrShortcutPayload = {
  templateType: "ACE_PICKUP" | "ACE_DROPOFF";
};
type GeocodeValidationResult = {
  input: string;
  formatted_address: string;
  place_id: string;
  lat: number;
  lng: number;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  validation_score: number;
  result_count: number;
  result_types: string[];
};
type AddressValidation = {
  status: "unvalidated" | "validated" | "as_is";
  input: string;
  result?: GeocodeValidationResult | null;
};
const days: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const tabs: Tab[] = [
  {
    id: "calls",
    label: "Calls",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 11a6 6 0 0 1 12 0v3a2.5 2.5 0 0 1-2.5 2.5H14a3 3 0 0 0-3 3v1a1.5 1.5 0 0 1-3 0v-2a4.5 4.5 0 0 1 4.5-4.5h1.5V11a3 3 0 0 0-6 0v2H6v-2z"
          fill="currentColor"
        />
        <rect x="3" y="10" width="3.4" height="7" rx="1.4" fill="currentColor" />
        <rect x="17.6" y="10" width="3.4" height="7" rx="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "drivers",
    label: "Drivers",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="7.7" r="2.8" fill="currentColor" />
        <path
          d="M7 12.5a5 5 0 0 1 10 0v3.2a2.8 2.8 0 0 1-2.8 2.8H9.8A2.8 2.8 0 0 1 7 15.7v-3.2z"
          fill="currentColor"
        />
        <rect x="4" y="14.5" width="16" height="4.5" rx="2.2" fill="currentColor" />
        <circle cx="8" cy="18.5" r="1.4" fill="rgba(5, 6, 8, 0.9)" />
        <circle cx="16" cy="18.5" r="1.4" fill="rgba(5, 6, 8, 0.9)" />
      </svg>
    ),
  },
  {
    id: "calculators",
    label: "TOOLS",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2.3" fill="currentColor" />
        <rect x="7.5" y="6" width="9" height="3" rx="0.8" fill="rgba(5, 6, 8, 0.9)" />
        <rect x="7.5" y="11" width="3.2" height="3.2" rx="0.6" fill="rgba(5, 6, 8, 0.9)" />
        <rect x="13.3" y="11" width="3.2" height="3.2" rx="0.6" fill="rgba(5, 6, 8, 0.9)" />
        <rect x="7.5" y="16" width="3.2" height="3.2" rx="0.6" fill="rgba(5, 6, 8, 0.9)" />
        <rect x="13.3" y="16" width="3.2" height="3.2" rx="0.6" fill="rgba(5, 6, 8, 0.9)" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Reports",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2.4" fill="currentColor" />
        <rect x="7.5" y="6.3" width="9" height="1.5" rx="0.7" fill="rgba(5, 6, 8, 0.9)" />
        <rect x="7.5" y="9.2" width="9" height="1.5" rx="0.7" fill="rgba(5, 6, 8, 0.9)" />
        <rect x="7.5" y="12.1" width="5.2" height="1.5" rx="0.7" fill="rgba(5, 6, 8, 0.9)" />
        <path d="M13.2 16.4l1.7-1.7 1.7 1.7 2.1-3.4" fill="none" stroke="rgba(5, 6, 8, 0.9)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M4.5 5.5L2 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M2 6.5H5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 3V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="12" r="5.2" fill="currentColor" />
        <circle cx="9" cy="12" r="2.1" fill="rgba(5, 6, 8, 0.9)" />
        <path
          d="M16.4 6.2l1.6 1.1 1.9-.4.4 2-1.4 1.2.5 1.9-2 .6-1.2-1.5-1.9.5-.7-2 1.6-1.1-.3-2 2-.3z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, "0")}${period}`;
};

const formatIsoTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatTimestamp(date.getTime());
};

const formatRemainingTime = (endValue?: string | null, nowMs?: number) => {
  if (!endValue) return "--";
  const end = new Date(endValue);
  if (Number.isNaN(end.getTime())) return "--";
  const diffMs = end.getTime() - (nowMs ?? Date.now());
  if (diffMs <= 0) return "0 min";
  const minutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMins}m`;
  }
  return `${minutes}m`;
};

const formatDurationMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes)) return "--";
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainingMins = rounded % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMins}m`;
  }
  return `${remainingMins}m`;
};

const durationMinutesBetween = (startValue?: string | null, endValue?: string | null) => {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / 60000);
};

const getLunchRemaining = (
  driver: DriverDashboardItem,
  todayShift: DriverShiftRecord | undefined,
  nowMs: number,
  pausedAt?: string | null,
  lunchStart?: string | null,
  accumPausedMs?: number,
  pausedSince?: string | null
) => {
  // Calculate total paused milliseconds (accumulated + ongoing if currently paused)
  let totalPausedMs = accumPausedMs ?? 0;
  if (pausedSince) {
    const ps = new Date(pausedSince);
    if (!Number.isNaN(ps.getTime())) {
      totalPausedMs += nowMs - ps.getTime();
    }
  }
  if (todayShift?.lunch_end) {
    if (driver.availability_status === "ON_LUNCH") {
      // Effective "now" adjusted for pause time
      const effectiveNow = nowMs - totalPausedMs;
      return formatRemainingTime(todayShift.lunch_end, effectiveNow);
    }
    if (pausedAt) {
      const paused = new Date(pausedAt);
      if (!Number.isNaN(paused.getTime())) {
        return formatRemainingTime(todayShift.lunch_end, paused.getTime());
      }
    }
  }
  if (driver.availability_status !== "ON_LUNCH") return "--";
  const updated = new Date(driver.availability_updated_at);
  if (Number.isNaN(updated.getTime())) return "--";
  const start = lunchStart ? new Date(lunchStart) : updated;
  if (Number.isNaN(start.getTime())) return "--";
  const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
  const effectiveNow = nowMs - totalPausedMs;
  return formatRemainingTime(fallbackEnd, effectiveNow);
};

const formatEventDetails = (eventType: string, metadata?: string | null) => {
  if (!metadata) return "--";
  let parsed: any = null;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return metadata;
  }
  if (eventType === "CALL_ASSIGNED") {
    return parsed?.to_driver ? `Assigned to ${parsed.to_driver}` : metadata;
  }
  if (eventType === "CALL_QUEUE_MOVED") {
    if (parsed?.from_driver && parsed?.to_driver) {
      return `Reassigned ${parsed.from_driver} → ${parsed.to_driver}`;
    }
    return metadata;
  }
  if (eventType === "CALL_UNASSIGNED") {
    return parsed?.from_driver ? `Removed from ${parsed.from_driver}` : metadata;
  }
  if (eventType === "CALL_ACTIVE_REASSIGNED") {
    if (parsed?.from_driver && parsed?.to_driver) {
      return parsed?.queued
        ? `Reassigned to ${parsed.to_driver} (queued)`
        : `Reassigned ${parsed.from_driver} → ${parsed.to_driver}`;
    }
    return metadata;
  }
  return metadata;
};

const isoToTimeInput = (value?: string | null, fallback = "08:00") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const timeInputToIso = (baseDate: Date, timeValue: string) => {
  const [hoursRaw, minutesRaw] = timeValue.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const next = new Date(baseDate);
  next.setHours(Number.isNaN(hours) ? 0 : hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
  return next.toISOString();
};

const formatIsoRange = (start?: string | null, end?: string | null) => {
  if (!start || !end) return "--";
  return `${formatIsoTime(start)}–${formatIsoTime(end)}`;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const lienFeeForDays = (days: number | null, override: boolean) => {
  if (days == null || days < 3) return null;
  return override ? 70 : 35;
};

const sanitizeAlphanumeric = (value: string) => value.replace(/[^a-z0-9 ]/gi, "");

const setWindowSizeConstraintsSafe = async (
  win: { setSizeConstraints: (constraints: Record<string, number | undefined>) => Promise<void> },
  constraints: Record<string, number | undefined>
) => {
  try {
    await win.setSizeConstraints(constraints);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("set_size_constraints not allowed")) {
      console.warn("setSizeConstraints failed", message);
    }
  }
};

const extractContactId = (...values: Array<string | null | undefined>) => {
  const joined = values.filter(Boolean).join(" | ");
  if (!joined) return "";
  const match = joined.match(/Contact ID:\s*([A-Za-z0-9-]+)/i);
  return match ? match[1] : "";
};

const extractNoteValue = (notes: string | null | undefined, label: string) => {
  if (!notes) return null;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*:\\s*([^|]+)`, "i");
  const match = notes.match(re);
  return match ? match[1].trim() : null;
};

const upsertNoteValue = (notes: string | null | undefined, label: string, value: string) => {
  const trimmed = value.trim();
  const parts = (notes ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (trimmed) {
    parts.push(`${label}: ${trimmed}`);
  }
  return parts.join(" | ");
};

const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  const main = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  return digits.length > 10 ? `${main} ${digits.slice(10)}` : main;
};

const normalizeMembership = (value: string) => {
  const raw = value.trim().toLowerCase();
  if (raw.includes("no coverage") || raw === "none" || raw === "no") return "none";
  if (raw.includes("premier")) return "premier";
  if (raw.includes("plus")) return "plus";
  if (raw.includes("classic")) return "classic";
  if (raw.includes("rv")) return "rv";
  return "";
};

const coverageMilesForMembership = (value: string | null | undefined) => {
  if (!value) return null;
  const membership = normalizeMembership(value);
  if (!membership) return null;
  const coverageByLevel: Record<string, number> = {
    classic: 7,
    plus: 100,
    premier: 200,
    rv: 0,
    none: 0,
  };
  return coverageByLevel[membership] ?? null;
};

const defaultAaaFlagged = () => ({
  calledMember: false,
  decision: null as "AGREED" | "DECLINED" | null,
  paidCard: false,
  paidCash: false,
  updateAaa: false,
  requestNsr: false,
  clearNsr: false,
});

const inclusiveDateDiffDays = (startValue: string, endValue: string) => {
  if (!startValue || !endValue) return null;
  const start = dateInputToDate(startValue);
  const end = dateInputToDate(endValue);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.floor((end.getTime() - start.getTime()) / msPerDay);
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff + 1;
};

const calendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const buildMonthGrid = (value: Date) => {
  const year = value.getFullYear();
  const month = value.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length < 42) {
    cells.push(null);
  }
  return cells;
};

const sanitizeLocation = (value: string) => value.replace(/[^a-z0-9 ]/gi, "");

const dateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfWeek = (value: Date) => {
  const date = new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const dateInputToDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const startOfMonth = (value: Date) => {
  const date = new Date(value.getFullYear(), value.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfMonth = (value: Date) => {
  const date = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const PANEL_SIDE_KEY = "dispatcherone.panelSide";
const ALWAYS_ON_TOP_KEY = "dispatcherone.alwaysOnTop";
const NAV_COLLAPSED_KEY = "dispatcherone.navCollapsed";
const WINDOW_WIDTH = 640;
const WEEKLY_SCHEDULE_GRID_WIDTH = 1060;
const WEEKLY_SCHEDULE_WINDOW_PADDING = 96;
const WEEKLY_SCHEDULE_DRAWER_WIDTH = WEEKLY_SCHEDULE_GRID_WIDTH + WEEKLY_SCHEDULE_WINDOW_PADDING;
const WEEKLY_SCHEDULE_BASE_WIDTH = WEEKLY_SCHEDULE_DRAWER_WIDTH;
const WEEKLY_SCHEDULE_DRAWER_HEIGHT = 760;
const WEEKLY_SCHEDULE_ADJUSTED_HEIGHT = WEEKLY_SCHEDULE_DRAWER_HEIGHT + WEEKLY_SCHEDULE_WINDOW_PADDING;
const WEEKLY_SCHEDULE_Y_OFFSET = 84;
const DRAWER_SCREEN_MARGIN = 16;
const ADD_CALL_DEFAULT_HEIGHT = 746.14;
const DRAWER_LABEL = "drawer";
const isEscapeKey = (event: KeyboardEvent): boolean =>
  event.key === "Escape" || event.key === "Esc" || event.code === "Escape";
const isEscapeReactEvent = (event: React.KeyboardEvent): boolean =>
  event.key === "Escape" || event.key === "Esc" || event.code === "Escape";

const FISH_WILDLIFE_TOW_FEE = 210;
const FISH_WILDLIFE_STORAGE_DAILY = 40;
const FISH_WILDLIFE_GATE_FEE = 105;
const CHP_GATE_FEE = 132;
const SD_TOW_REGULAR = 243;
const SD_TOW_MEDIUM = 356;
const SD_TOW_HEAVY = 424;
const SD_STORAGE_REGULAR = 65;
const SD_STORAGE_MEDIUM = 98;
const SD_STORAGE_HEAVY = 132;
const SD_FLATBED_FEE = 47;
const SD_GATE_FEE = 50;
const SHERIFF_TOW_REGULAR = 204;
const SHERIFF_TOW_MEDIUM = 231;
const SHERIFF_STORAGE_REGULAR = 44;
const SHERIFF_STORAGE_MEDIUM = 55;
const SHERIFF_FEE = 61;
const SHERIFF_GATE_FEE = 102;
const CVPD_TOW_BASIC = 289;
const CVPD_TOW_MEDIUM = 324;
const CVPD_TOW_HEAVY = 374;
const CVPD_STORAGE_BASIC = 74;
const CVPD_STORAGE_MEDIUM = 83;
const CVPD_STORAGE_HEAVY = 92;
const CVPD_LABOR_RATE = 65;
const CVPD_NEGLIGENCE_FEE = 175;
const CVPD_GATE_FEE = 65;
const OVER_MILES_RATE = 12;

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const floatingTabId = searchParams.get("floating");
  const reportView = searchParams.get("report");
  const reportTabId =
    reportView === "daily"
      ? "daily-report"
      : reportView === "driver"
        ? "driver-report"
        : null;
  const drawerMode = searchParams.get("drawer");
  const drawerCallId = searchParams.get("callId");
  const drawerEdit = searchParams.get("edit") === "1";
  const initialIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === floatingTabId)
  );
  const isFloatingWindow = Boolean(floatingTabId);
  const isReportWindow = Boolean(reportTabId);
  const isDrawerWindow =
    drawerMode === "new-call" || drawerMode === "call-detail" || drawerMode === "weekly-schedule";
  const windowModeClass = isDrawerWindow
    ? "window-shell--drawer"
    : isFloatingWindow
      ? "window-shell--floating"
      : isReportWindow
        ? "window-shell--report"
        : "window-shell--main";
  const showNavigation = !isReportWindow;
  const showHeaderActions = !isReportWindow;

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(NAV_COLLAPSED_KEY);
    return stored === "true";
  });
  const [panelSide, setPanelSide] = useState<"left" | "right">(() => {
    const stored = localStorage.getItem(PANEL_SIDE_KEY);
    return stored === "left" || stored === "right" ? stored : "right";
  });
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => {
    const stored = localStorage.getItem(ALWAYS_ON_TOP_KEY);
    return stored === "false" ? false : true;
  });
  const drawerModeRef = useRef<"call-detail" | "weekly-schedule" | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const nonMainShellRef = useRef<HTMLDivElement | null>(null);
  const weeklyGridRef = useRef<HTMLDivElement | null>(null);
  const lastEscapeHandledAtRef = useRef(0);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const isTauri = Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  const [scheduleDrivers, setScheduleDrivers] = useState<DriverRecord[]>([]);
  const [scheduleShifts, setScheduleShifts] = useState<DriverShiftRecord[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [driverReport, setDriverReport] = useState<DriverCallReportItem[]>([]);
  const [driverReportLoading, setDriverReportLoading] = useState(false);
  const [driverReportError, setDriverReportError] = useState<string | null>(null);
  const [dailyReportItems, setDailyReportItems] = useState<DriverCallReportItem[]>([]);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [dailyReportError, setDailyReportError] = useState<string | null>(null);
  const [dailyReportDetails, setDailyReportDetails] = useState<Record<string, CallDetail>>({});
  const [dailyReportNotes, setDailyReportNotes] = useState("");
  const [pauseLunchAt, setPauseLunchAt] = useState<Record<string, string>>({});
  const [lunchStartAt, setLunchStartAt] = useState<Record<string, string>>({});
  // Lunch pause tracking: driverId -> ISO timestamp when current pause started (paused = status still ON_LUNCH but timer frozen)
  const [lunchPausedSince, setLunchPausedSince] = useState<Record<string, string>>({});
  // Accumulated paused milliseconds per driver (persisted in localStorage)
  const [lunchAccumPausedMs, setLunchAccumPausedMs] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem("lunchAccumPausedMs");
      return stored ? (JSON.parse(stored) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const lunchAutoEndingRef = useRef<Set<string>>(new Set());
  const [eventLogItems, setEventLogItems] = useState<EventLogItem[]>([]);
  const [eventLogLoading, setEventLogLoading] = useState(false);
  const [eventLogError, setEventLogError] = useState<string | null>(null);
  const [eventLogSearch, setEventLogSearch] = useState("");
  const [eventLogEntityType, setEventLogEntityType] = useState("");
  const [eventLogEventType, setEventLogEventType] = useState("");
  const [eventLogLastCleared, setEventLogLastCleared] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [aaaCalls, setAaaCalls] = useState<AaaMemberCall[]>([]);
  const [aaaCallsLoading, setAaaCallsLoading] = useState(false);
  const [aaaCallsError, setAaaCallsError] = useState<string | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<"ALL" | "COMPLETED" | "CANCELLED">("ALL");
  const [reportStartDate, setReportStartDate] = useState(() => dateKey(new Date()));
  const [reportEndDate, setReportEndDate] = useState(() => dateKey(new Date()));
  // Call history tab state
  const [historyItems, setHistoryItems] = useState<CallHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historySourceFilter, setHistorySourceFilter] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverEditMode, setDriverEditMode] = useState<Record<string, boolean>>({});
  const [driverEditDrafts, setDriverEditDrafts] = useState<Record<string, DriverCardDraft>>({});
  const [dragPayload, setDragPayload] = useState<{
    callId: string;
    fromOwner: { type: "driver"; driverId: string } | { type: "unassigned" };
  } | null>(null);
  const [dragOverDriverId, setDragOverDriverId] = useState<string | null>(null);
  const [dragOverCallId, setDragOverCallId] = useState<string | null>(null);
  const [dragOverPlacement, setDragOverPlacement] = useState<"before" | "after" | null>(null);
  const [dragOverUnassigned, setDragOverUnassigned] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isDeleteEmployeeOpen, setIsDeleteEmployeeOpen] = useState(false);
  const [deleteEmployeeId, setDeleteEmployeeId] = useState("");
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [isClearWeekOpen, setIsClearWeekOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<DriverShiftRecord | null>(null);
  const employeeNameInputRef = useRef<HTMLInputElement | null>(null);
  const shiftEmployeeSelectRef = useRef<HTMLSelectElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedPendingCallIds, setSelectedPendingCallIds] = useState<Set<string>>(new Set());
  const [isAddCallOpen, setIsAddCallOpen] = useState(false);
  const [addCallModalHeight, setAddCallModalHeight] = useState<number | null>(null);
  const [captureCountdown, setCaptureCountdown] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [prioritySettings, setPrioritySettings] = useState<Record<string, string>>({});
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [geocodeTestMode, setGeocodeTestMode] = useState(false);
  const [tesseractPath, setTesseractPath] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [serverAuthToken, setServerAuthToken] = useState("");
  const [addCallError, setAddCallError] = useState("");
  const [ocrLoading, setOcrLoading] = useState<null | "pickup" | "dropoff">(null);
  const [ocrPreview, setOcrPreview] = useState<OcrImportPreview | null>(null);
  const [, setOcrNotice] = useState<string | null>(null);
  const [, setOcrLastTemplate] = useState<"ACE_PICKUP" | "ACE_DROPOFF" | null>(null);
  const [ocrImportIds, setOcrImportIds] = useState<{ pickup?: string; dropoff?: string }>({});
  const [ocrConfirm, setOcrConfirm] = useState<{
    preview: OcrImportPreview;
    templateType: "ACE_PICKUP" | "ACE_DROPOFF";
    addressText: string;
    validation?: GeocodeValidationResult | null;
    validationError?: string | null;
    validating?: boolean;
  } | null>(null);
  const [, setPickupValidation] = useState<AddressValidation>({
    status: "unvalidated",
    input: "",
    result: null,
  });
  const [, setDropoffValidation] = useState<AddressValidation>({
    status: "unvalidated",
    input: "",
    result: null,
  });
  const [towMiles, setTowMiles] = useState<number | null>(null);
  const [towMilesLoading, setTowMilesLoading] = useState(false);
  const [towMilesError, setTowMilesError] = useState<string | null>(null);
  const [callTowMiles, setCallTowMiles] = useState<Record<string, number>>({});
  const [callTowMilesLoading, setCallTowMilesLoading] = useState<Record<string, boolean>>({});
  const [callTowMilesError, setCallTowMilesError] = useState<Record<string, string>>({});
  const [driverLocationDrafts, setDriverLocationDrafts] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const ocrCaptureRequestSeqRef = useRef(0);
  const activeOcrCaptureRequestRef = useRef<number | null>(null);
  const canceledOcrCaptureRequestsRef = useRef<Set<number>>(new Set());
  const pickupInputRef = useRef<HTMLInputElement | null>(null);
  const dropoffInputRef = useRef<HTMLInputElement | null>(null);
  const [completeLoading, setCompleteLoading] = useState<Record<string, boolean>>({});
  const [callsSectionsOpen, setCallsSectionsOpen] = useState({
    active: true,
    drivers: true,
    pending: true,
  });
  const [overMilesChecklist, setOverMilesChecklist] = useState<{
    calledMember: boolean;
    decision: "AGREED" | "REFUSED" | "";
    paidCard: boolean;
    paidCash: boolean;
    updateAaa: boolean;
    nsrClear: boolean;
  }>({
    calledMember: false,
    decision: "",
    paidCard: false,
    paidCash: false,
    updateAaa: false,
    nsrClear: false,
  });
  const [clearChecklist, setClearChecklist] = useState<
    Record<
      string,
      {
        updateAaa: boolean;
        setResolution: boolean;
        clearConsole: boolean;
      }
    >
  >({});
  const [clearErrors, setClearErrors] = useState<Record<string, string>>({});
  const [nsrChecklist, setNsrChecklist] = useState<
    Record<
      string,
      {
        standbyFive: boolean;
        contactMember: boolean;
        updateAaa: boolean;
        requestNsr: boolean;
        clearCallNsr: boolean;
      }
    >
  >({});
  const [nsrErrors, setNsrErrors] = useState<Record<string, string>>({});
  // manual driver scheduling removed in backend-driven schedule
  const emptyCallDraft = {
    callType: "",
    workType: "",
    callNumber: "",
    pickupLocation: "",
    dropoffLocation: "",
    leTimestamp: "",
    codTimestamp: "",
    ppiTimestamp: "",
    contactId: "",
    memberName: "",
    memberPhone: "",
    coverage: "",
    vehicleType: "",
    pta: "",
    assignedDriverId: "",
    lawAgency: "",
    notes: "",
    inTowEta: "",
    serviceType: "",
    serviceCharge: "",
    serviceCharges: [] as Array<{ label: string; amount: string }>,
  };
  const [callDraft, setCallDraft] = useState(emptyCallDraft);
  const [employeeDraft, setEmployeeDraft] = useState({
    name: "",
  });
  const [shiftDraft, setShiftDraft] = useState({
    employeeId: "",
    days: ["Mon"] as Day[],
    start: "08:00",
    end: "17:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    lunchOverride: false,
  });
  const [editDraft, setEditDraft] = useState({
    start: "08:00",
    end: "17:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    lunchOverride: false,
  });
  const [storageTowFee, setStorageTowFee] = useState("");
  const [storageDailyFee, setStorageDailyFee] = useState("");
  const [storageDateIn, setStorageDateIn] = useState("");
  const [storageDateOut, setStorageDateOut] = useState("");
  const [storageLienOverride, setStorageLienOverride] = useState(false);
  const [storageCalc, setStorageCalc] = useState<{
    days: number | null;
    storageTotal: number | null;
    lienFee: number | null;
    grandTotal: number | null;
  }>({
    days: null,
    storageTotal: null,
    lienFee: null,
    grandTotal: null,
  });
  const [storageCalcError, setStorageCalcError] = useState<string | null>(null);
  const [storageCalendarMonth, setStorageCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [storageCalendarTarget, setStorageCalendarTarget] = useState<"in" | "out">("in");
  const [activeCalculatorId, setActiveCalculatorId] = useState<
    "storage" | "towing" | "over-miles"
  >("storage");
  const [towingAgency, setTowingAgency] = useState("");
  const [towingDateIn, setTowingDateIn] = useState("");
  const [towingDateOut, setTowingDateOut] = useState("");
  const [towingGateFee, setTowingGateFee] = useState(false);
  const [towingLienOverride, setTowingLienOverride] = useState(false);
  const [towingCalc, setTowingCalc] = useState<{
    days: number | null;
    storageTotal: number | null;
    towFee: number | null;
    gateFee: number | null;
    lienFee: number | null;
    total: number | null;
  }>({
    days: null,
    storageTotal: null,
    towFee: null,
    gateFee: null,
    lienFee: null,
    total: null,
  });
  const [towingCalcError, setTowingCalcError] = useState<string | null>(null);
  const [chpClass, setChpClass] = useState("");
  const [chpStorageType, setChpStorageType] = useState("");
  const [chpDateIn, setChpDateIn] = useState("");
  const [chpDateOut, setChpDateOut] = useState("");
  const [chpGateFee, setChpGateFee] = useState(false);
  const [chpLienOverride, setChpLienOverride] = useState(false);
  const [chpCalc, setChpCalc] = useState<{
    days: number | null;
    towTotal: number | null;
    storageTotal: number | null;
    gateFee: number | null;
    lienFee: number | null;
    total: number | null;
  }>({
    days: null,
    towTotal: null,
    storageTotal: null,
    gateFee: null,
    lienFee: null,
    total: null,
  });
  const [chpCalcError, setChpCalcError] = useState<string | null>(null);
  const [sdTowType, setSdTowType] = useState("");
  const [sdStorageType, setSdStorageType] = useState("");
  const [sdDateIn, setSdDateIn] = useState("");
  const [sdDateOut, setSdDateOut] = useState("");
  const [sdFlatbedFee, setSdFlatbedFee] = useState(false);
  const [sdGateFee, setSdGateFee] = useState(false);
  const [sdLienOverride, setSdLienOverride] = useState(false);
  const [sdCalc, setSdCalc] = useState<{
    days: number | null;
    towFee: number | null;
    storageTotal: number | null;
    flatbedFee: number | null;
    gateFee: number | null;
    lienFee: number | null;
    total: number | null;
  }>({
    days: null,
    towFee: null,
    storageTotal: null,
    flatbedFee: null,
    gateFee: null,
    lienFee: null,
    total: null,
  });
  const [sdCalcError, setSdCalcError] = useState<string | null>(null);
  const [sheriffTowType, setSheriffTowType] = useState("");
  const [sheriffStorageType, setSheriffStorageType] = useState("");
  const [sheriffDateIn, setSheriffDateIn] = useState("");
  const [sheriffDateOut, setSheriffDateOut] = useState("");
  const [sheriffGateFee, setSheriffGateFee] = useState(false);
  const [sheriffLienOverride, setSheriffLienOverride] = useState(false);
  const [sheriffCalc, setSheriffCalc] = useState<{
    days: number | null;
    towFee: number | null;
    storageTotal: number | null;
    sheriffFee: number | null;
    gateFee: number | null;
    lienFee: number | null;
    total: number | null;
  }>({
    days: null,
    towFee: null,
    storageTotal: null,
    sheriffFee: null,
    gateFee: null,
    lienFee: null,
    total: null,
  });
  const [sheriffCalcError, setSheriffCalcError] = useState<string | null>(null);
  const [cvpdTowType, setCvpdTowType] = useState("");
  const [cvpdStorageType, setCvpdStorageType] = useState("");
  const [cvpdDateIn, setCvpdDateIn] = useState("");
  const [cvpdDateOut, setCvpdDateOut] = useState("");
  const [cvpdLaborHours, setCvpdLaborHours] = useState("");
  const [cvpdLaborMinutes, setCvpdLaborMinutes] = useState("");
  const [cvpdNegligenceFee, setCvpdNegligenceFee] = useState(false);
  const [cvpdGateFee, setCvpdGateFee] = useState(false);
  const [cvpdLienOverride, setCvpdLienOverride] = useState(false);
  const [cvpdCalc, setCvpdCalc] = useState<{
    days: number | null;
    towFee: number | null;
    storageTotal: number | null;
    laborFee: number | null;
    negligenceFee: number | null;
    gateFee: number | null;
    lienFee: number | null;
    total: number | null;
  }>({
    days: null,
    towFee: null,
    storageTotal: null,
    laborFee: null,
    negligenceFee: null,
    gateFee: null,
    lienFee: null,
    total: null,
  });
  const [cvpdCalcError, setCvpdCalcError] = useState<string | null>(null);
  const [overMilesMode, setOverMilesMode] = useState<"existing" | "manual">("existing");
  const [overMilesCallId, setOverMilesCallId] = useState("");
  const overMilesCallSelectRef = useRef<HTMLSelectElement | null>(null);
  const [overMilesPickup, setOverMilesPickup] = useState("");
  const [overMilesDropoff, setOverMilesDropoff] = useState("");
  const [overMilesMembership, setOverMilesMembership] = useState("");
  const [_overMilesTowMiles, setOverMilesTowMiles] = useState<number | null>(null);  const [overMilesRounded, setOverMilesRounded] = useState<number | null>(null);
  const [overMilesTotal, setOverMilesTotal] = useState<number | null>(null);
  const [overMilesCalcCost, setOverMilesCalcCost] = useState<number | null>(null);
  const [overMilesLoading, setOverMilesLoading] = useState(false);
  const [overMilesError, setOverMilesError] = useState<string | null>(null);
  const [aaaMemberRows, setAaaMemberRows] = useState<Record<string, AaaMemberRow[]>>({});
  const [aaaFlaggedChecklist, setAaaFlaggedChecklist] = useState<
    Record<
      string,
      {
        calledMember: boolean;
        decision: "AGREED" | "DECLINED" | null;
        paidCard: boolean;
        paidCash: boolean;
        updateAaa: boolean;
        requestNsr: boolean;
        clearNsr: boolean;
      }
    >
  >({});
  const [drawerCallDetail, setDrawerCallDetail] = useState<CallDetail | null>(null);
  const [drawerCallLoading, setDrawerCallLoading] = useState(false);
  const [drawerCallError, setDrawerCallError] = useState<string | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [trackingLinkUrl, setTrackingLinkUrl] = useState<string | null>(null);
  const [trackingLinkLoading, setTrackingLinkLoading] = useState(false);
  const [trackingLinkCopied, setTrackingLinkCopied] = useState(false);
  const [floatingDetail, setFloatingDetail] = useState<{
    callId: string;
    anchor: { top: number; left: number };
    driverId?: string | null;
  } | null>(null);
  const [floatingDetailCall, setFloatingDetailCall] = useState<CallDetail | null>(null);
  const [floatingDetailLoading, setFloatingDetailLoading] = useState(false);
  const [floatingDetailError, setFloatingDetailError] = useState<string | null>(null);
  const [drawerEditDraft, setDrawerEditDraft] = useState({
    external_call_number: "",
    source_type: "",
    law_agency: "",
    pickup_address: "",
    dropoff_address: "",
    pickup_notes: "",
    contact_id: "",
    contact_name: "",
    callback_phone: "",
    vehicle_description: "",
    membership_level: "",
    pricing_category: "",
    pricing_total: "",
    pricing_notes: "",
    payment_type: "",
    amount_paid: "",
    notes: "",
    priority_group: "",
  });

  const activeLabel = useMemo(() => {
    if (reportTabId === "daily-report") return "Daily Report";
    if (reportTabId === "driver-report") return "Driver Report";
    return tabs[activeIndex]?.label ?? "";
  }, [activeIndex, reportTabId]);
  const activeTabId = reportTabId ?? tabs[activeIndex]?.id ?? "calls";
  const scheduleShiftLookup = useMemo(() => {
    const map = new Map<string, DriverShiftRecord>();
    scheduleShifts.forEach((shift) => {
      const date = new Date(shift.shift_start);
      if (Number.isNaN(date.getTime())) return;
      map.set(`${shift.driver_id}-${dateKey(date)}`, shift);
    });
    return map;
  }, [scheduleShifts]);

  const overMilesCallOptions = useMemo(() => {
    if (!dashboard) return [];
    const map = new Map<string, CallSummary>();
    dashboard.drivers.forEach((driver) => {
      if (driver.active_call) {
        map.set(driver.active_call.call_id, driver.active_call);
      }
      driver.pending_queue.forEach((call) => {
        map.set(call.call_id, call);
      });
    });
    dashboard.unassigned_calls.forEach((call) => {
      map.set(call.call_id, call);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aTime = new Date(a.status_updated_at ?? "").getTime();
      const bTime = new Date(b.status_updated_at ?? "").getTime();
      return bTime - aTime;
    });
  }, [dashboard]);

  const aaaDriverByCallId = useMemo(() => {
    if (!dashboard) return new Map<string, string>();
    const map = new Map<string, string>();
    dashboard.drivers.forEach((driver) => {
      if (driver.active_call) {
        map.set(driver.active_call.call_id, driver.display_name);
      }
      driver.pending_queue.forEach((call) => {
        if (!map.has(call.call_id)) {
          map.set(call.call_id, driver.display_name);
        }
      });
    });
    return map;
  }, [dashboard]);

  const shiftsTodayBackend = useMemo(() => {
    const todayKey = dateKey(new Date(nowMs));
    return scheduleShifts.filter((shift) => dateKey(new Date(shift.shift_start)) === todayKey);
  }, [scheduleShifts, nowMs]);

  const resetStorageCalc = (clearError = false) => {
    setStorageCalc({
      days: null,
      storageTotal: null,
      lienFee: null,
      grandTotal: null,
    });
    if (clearError) {
      setStorageCalcError(null);
    }
  };

  const resetTowingCalc = (clearError = false) => {
    setTowingCalc({
      days: null,
      storageTotal: null,
      towFee: null,
      gateFee: null,
      lienFee: null,
      total: null,
    });
    if (clearError) {
      setTowingCalcError(null);
    }
  };

  const resetChpCalc = (clearError = false) => {
    setChpCalc({
      days: null,
      towTotal: null,
      storageTotal: null,
      gateFee: null,
      lienFee: null,
      total: null,
    });
    if (clearError) {
      setChpCalcError(null);
    }
  };

  const resetSdCalc = (clearError = false) => {
    setSdCalc({
      days: null,
      towFee: null,
      storageTotal: null,
      flatbedFee: null,
      gateFee: null,
      lienFee: null,
      total: null,
    });
    if (clearError) {
      setSdCalcError(null);
    }
  };

  const resetSheriffCalc = (clearError = false) => {
    setSheriffCalc({
      days: null,
      towFee: null,
      storageTotal: null,
      sheriffFee: null,
      gateFee: null,
      lienFee: null,
      total: null,
    });
    if (clearError) {
      setSheriffCalcError(null);
    }
  };

  const resetCvpdCalc = (clearError = false) => {
    setCvpdCalc({
      days: null,
      towFee: null,
      storageTotal: null,
      laborFee: null,
      negligenceFee: null,
      gateFee: null,
      lienFee: null,
      total: null,
    });
    if (clearError) {
      setCvpdCalcError(null);
    }
  };

  const handleStorageCalculate = () => {
    const dailyFee = parseOptionalNumber(storageDailyFee);
    if (dailyFee == null) {
      setStorageCalcError("Storage fee is required.");
      resetStorageCalc();
      return;
    }
    const days = inclusiveDateDiffDays(storageDateIn, storageDateOut);
    if (days == null) {
      setStorageCalcError("Select a valid date range.");
      resetStorageCalc();
      return;
    }
    const towFee = parseOptionalNumber(storageTowFee) ?? 0;
    const storageTotal = days * dailyFee;
    const lienFee = days >= 3 ? (storageLienOverride ? 70 : 35) : null;
    const grandTotal = storageTotal + towFee + (lienFee ?? 0);
    setStorageCalc({
      days,
      storageTotal,
      lienFee,
      grandTotal,
    });
    setStorageCalcError(null);
  };

  const handleTowingCalculate = () => {
    if (towingAgency !== "fish_wildlife") {
      setTowingCalcError("Select an agency to calculate.");
      resetTowingCalc();
      return;
    }
    const days = inclusiveDateDiffDays(towingDateIn, towingDateOut);
    if (days == null) {
      setTowingCalcError("Select a valid date range.");
      resetTowingCalc();
      return;
    }
    const towFee = FISH_WILDLIFE_TOW_FEE;
    const storageTotal = days * FISH_WILDLIFE_STORAGE_DAILY;
    const gateFee = towingGateFee ? FISH_WILDLIFE_GATE_FEE : 0;
    const lienFee = lienFeeForDays(days, towingLienOverride);
    const total = towFee + storageTotal + gateFee + (lienFee ?? 0);
    setTowingCalc({
      days,
      storageTotal,
      towFee,
      gateFee: towingGateFee ? FISH_WILDLIFE_GATE_FEE : null,
      lienFee,
      total,
    });
    setTowingCalcError(null);
  };

  const handleChpCalculate = () => {
    const classKey = chpClass;
    const storageKey = chpStorageType;
    if (!classKey) {
      setChpCalcError("Select a CHP class.");
      resetChpCalc();
      return;
    }
    if (!storageKey) {
      setChpCalcError("Select a storage type.");
      resetChpCalc();
      return;
    }
    const days = inclusiveDateDiffDays(chpDateIn, chpDateOut);
    if (days == null) {
      setChpCalcError("Select a valid date range.");
      resetChpCalc();
      return;
    }
    const classRates: Record<string, number> = {
      class_a: 305,
      class_b: 335,
      class_c: 401,
      class_d: 420,
    };
    const storageRates: Record<string, number> = {
      class_a_inside: 77,
      class_a_outside: 83,
      class_b_inside: 88,
      class_c_outside: 99,
      class_d_outside: 110,
    };
    const towRate = classRates[classKey];
    const storageRate = storageRates[storageKey];
    if (!towRate || !storageRate) {
      setChpCalcError("Invalid class or storage selection.");
      resetChpCalc();
      return;
    }
    const towTotal = towRate;
    const storageTotal = storageRate * days;
    const gateFee = chpGateFee ? CHP_GATE_FEE : 0;
    const lienFee = lienFeeForDays(days, chpLienOverride);
    const total = towTotal + storageTotal + gateFee + (lienFee ?? 0);
    setChpCalc({
      days,
      towTotal,
      storageTotal,
      gateFee: chpGateFee ? CHP_GATE_FEE : null,
      lienFee,
      total,
    });
    setChpCalcError(null);
  };

  const handleSdCalculate = () => {
    if (sdTowType === "") {
      setSdCalcError("Select a tow type.");
      resetSdCalc();
      return;
    }
    if (sdStorageType === "") {
      setSdCalcError("Select a storage type.");
      resetSdCalc();
      return;
    }
    const days = inclusiveDateDiffDays(sdDateIn, sdDateOut);
    if (days == null) {
      setSdCalcError("Select a valid date range.");
      resetSdCalc();
      return;
    }
    const towFees: Record<string, number> = {
      regular: SD_TOW_REGULAR,
      medium: SD_TOW_MEDIUM,
      heavy: SD_TOW_HEAVY,
    };
    const storageFees: Record<string, number> = {
      regular: SD_STORAGE_REGULAR,
      medium: SD_STORAGE_MEDIUM,
      heavy: SD_STORAGE_HEAVY,
    };
    const towFee = towFees[sdTowType];
    const storageRate = storageFees[sdStorageType];
    if (!towFee || !storageRate) {
      setSdCalcError("Invalid tow or storage selection.");
      resetSdCalc();
      return;
    }
    const storageTotal = storageRate * days;
    const flatbedFee = sdFlatbedFee ? SD_FLATBED_FEE : 0;
    const gateFee = sdGateFee ? SD_GATE_FEE : 0;
    const lienFee = lienFeeForDays(days, sdLienOverride);
    const total = towFee + storageTotal + flatbedFee + gateFee + (lienFee ?? 0);
    setSdCalc({
      days,
      towFee,
      storageTotal,
      flatbedFee: sdFlatbedFee ? SD_FLATBED_FEE : null,
      gateFee: sdGateFee ? SD_GATE_FEE : null,
      lienFee,
      total,
    });
    setSdCalcError(null);
  };

  const handleSheriffCalculate = () => {
    if (sheriffTowType === "") {
      setSheriffCalcError("Select a tow type.");
      resetSheriffCalc();
      return;
    }
    if (sheriffStorageType === "") {
      setSheriffCalcError("Select a storage type.");
      resetSheriffCalc();
      return;
    }
    const days = inclusiveDateDiffDays(sheriffDateIn, sheriffDateOut);
    if (days == null) {
      setSheriffCalcError("Select a valid date range.");
      resetSheriffCalc();
      return;
    }
    const towFees: Record<string, number> = {
      regular: SHERIFF_TOW_REGULAR,
      medium: SHERIFF_TOW_MEDIUM,
    };
    const storageFees: Record<string, number> = {
      regular: SHERIFF_STORAGE_REGULAR,
      medium: SHERIFF_STORAGE_MEDIUM,
    };
    const towFee = towFees[sheriffTowType];
    const storageRate = storageFees[sheriffStorageType];
    if (!towFee || !storageRate) {
      setSheriffCalcError("Invalid tow or storage selection.");
      resetSheriffCalc();
      return;
    }
    const storageTotal = storageRate * days;
    const gateFee = sheriffGateFee ? SHERIFF_GATE_FEE : 0;
    const lienFee = lienFeeForDays(days, sheriffLienOverride);
    const total = towFee + storageTotal + SHERIFF_FEE + gateFee + (lienFee ?? 0);
    setSheriffCalc({
      days,
      towFee,
      storageTotal,
      sheriffFee: SHERIFF_FEE,
      gateFee: sheriffGateFee ? SHERIFF_GATE_FEE : null,
      lienFee,
      total,
    });
    setSheriffCalcError(null);
  };

  const handleCvpdCalculate = () => {
    if (cvpdTowType === "") {
      setCvpdCalcError("Select a tow type.");
      resetCvpdCalc();
      return;
    }
    if (cvpdStorageType === "") {
      setCvpdCalcError("Select a storage type.");
      resetCvpdCalc();
      return;
    }
    const days = inclusiveDateDiffDays(cvpdDateIn, cvpdDateOut);
    if (days == null) {
      setCvpdCalcError("Select a valid date range.");
      resetCvpdCalc();
      return;
    }
    const hoursRaw = cvpdLaborHours.trim();
    const minutesRaw = cvpdLaborMinutes.trim();
    const hours = hoursRaw ? Number(hoursRaw) : 0;
    const minutes = minutesRaw ? Number(minutesRaw) : 0;
    if ((!Number.isFinite(hours) && hoursRaw) || hours < 0) {
      setCvpdCalcError("Labor hours must be 0 or greater.");
      resetCvpdCalc();
      return;
    }
    if ((!Number.isFinite(minutes) && minutesRaw) || minutes < 0 || minutes >= 60) {
      setCvpdCalcError("Labor minutes must be between 0 and 59.");
      resetCvpdCalc();
      return;
    }
    const towFees: Record<string, number> = {
      basic: CVPD_TOW_BASIC,
      medium: CVPD_TOW_MEDIUM,
      heavy: CVPD_TOW_HEAVY,
    };
    const storageFees: Record<string, number> = {
      basic: CVPD_STORAGE_BASIC,
      medium: CVPD_STORAGE_MEDIUM,
      heavy: CVPD_STORAGE_HEAVY,
    };
    const towFee = towFees[cvpdTowType];
    const storageRate = storageFees[cvpdStorageType];
    if (!towFee || !storageRate) {
      setCvpdCalcError("Invalid tow or storage selection.");
      resetCvpdCalc();
      return;
    }
    const storageTotal = storageRate * days;
    const totalMinutes = hours * 60 + minutes;
    const laborFee =
      totalMinutes > 60 ? ((totalMinutes - 60) / 60) * CVPD_LABOR_RATE : 0;
    const gateFee = cvpdGateFee ? CVPD_GATE_FEE : 0;
    const negligenceFee = cvpdNegligenceFee ? CVPD_NEGLIGENCE_FEE : 0;
    const lienFee = lienFeeForDays(days, cvpdLienOverride);
    const total = towFee + storageTotal + laborFee + negligenceFee + gateFee + (lienFee ?? 0);
    setCvpdCalc({
      days,
      towFee,
      storageTotal,
      laborFee,
      negligenceFee: cvpdNegligenceFee ? CVPD_NEGLIGENCE_FEE : null,
      gateFee: cvpdGateFee ? CVPD_GATE_FEE : null,
      lienFee,
      total,
    });
    setCvpdCalcError(null);
  };

  const handleStorageClear = () => {
    setStorageTowFee("");
    setStorageDailyFee("");
    setStorageDateIn("");
    setStorageDateOut("");
    setStorageLienOverride(false);
    resetStorageCalc(true);
    setStorageCalendarMonth(startOfMonth(new Date()));
    setStorageCalendarTarget("in");
  };

  const handleTowingClearAll = () => {
    setTowingAgency("");
    setTowingDateIn("");
    setTowingDateOut("");
    setTowingGateFee(false);
    setTowingLienOverride(false);
    resetTowingCalc(true);

    setChpClass("");
    setChpStorageType("");
    setChpDateIn("");
    setChpDateOut("");
    setChpGateFee(false);
    setChpLienOverride(false);
    resetChpCalc(true);

    setSdTowType("");
    setSdStorageType("");
    setSdDateIn("");
    setSdDateOut("");
    setSdFlatbedFee(false);
    setSdGateFee(false);
    setSdLienOverride(false);
    resetSdCalc(true);

    setCvpdTowType("");
    setCvpdStorageType("");
    setCvpdDateIn("");
    setCvpdDateOut("");
    setCvpdLaborHours("");
    setCvpdLaborMinutes("");
    setCvpdNegligenceFee(false);
    setCvpdGateFee(false);
    setCvpdLienOverride(false);
    resetCvpdCalc(true);

    setSheriffTowType("");
    setSheriffStorageType("");
    setSheriffDateIn("");
    setSheriffDateOut("");
    setSheriffGateFee(false);
    setSheriffLienOverride(false);
    resetSheriffCalc(true);
  };

  const handleOverMilesClear = () => {
    setOverMilesCallId("");
    setOverMilesPickup("");
    setOverMilesDropoff("");
    setOverMilesMembership("");
    setOverMilesTowMiles(null);
    setOverMilesRounded(null);
    setOverMilesTotal(null);
    setOverMilesCalcCost(null);
    setOverMilesLoading(false);
    setOverMilesError(null);
  };

  const getAaaFlaggedChecklist = (callId: string) =>
    aaaFlaggedChecklist[callId] ?? defaultAaaFlagged();

  const updateAaaFlaggedChecklist = (
    callId: string,
    updates: Partial<ReturnType<typeof defaultAaaFlagged>>
  ) => {
    setAaaFlaggedChecklist((prev) => {
      const next = {
        ...defaultAaaFlagged(),
        ...prev[callId],
        ...updates,
      };
      if (next.decision !== "AGREED") {
        next.paidCard = false;
        next.paidCash = false;
      }
      if (next.decision !== "DECLINED") {
        next.updateAaa = false;
        next.requestNsr = false;
        next.clearNsr = false;
      }
      return { ...prev, [callId]: next };
    });
  };

  const isCallOverMiles = (callId: string, membershipLevel?: string | null) => {
    const miles = callTowMiles[callId];
    if (miles == null) return false;
    const coverage = coverageMilesForMembership(membershipLevel ?? null);
    if (coverage == null) return false;
    return miles > coverage;
  };

  const renderAaaFlaggedChecklist = (callId: string) => {
    const checklist = getAaaFlaggedChecklist(callId);
    return (
      <div
        className="aaa-flagged"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="aaa-flagged-title">FLAGGED</div>
        <label className="checklist-item">
          <input
            type="checkbox"
            checked={checklist.calledMember}
            onChange={(event) => {
              event.stopPropagation();
              updateAaaFlaggedChecklist(callId, { calledMember: !checklist.calledMember });
            }}
          />
          <span>Call member to notify over miles</span>
        </label>
        {checklist.calledMember ? (
          <>
            <div className="checklist-item">
              <span>Member response</span>
            </div>
            <label className="checklist-item">
              <input
                type="checkbox"
                checked={checklist.decision === "AGREED"}
                onChange={(event) => {
                  event.stopPropagation();
                  updateAaaFlaggedChecklist(callId, {
                    decision: checklist.decision === "AGREED" ? null : "AGREED",
                  });
                }}
              />
              <span>Agreed to payment of over miles</span>
            </label>
            {checklist.decision === "AGREED" ? (
              <>
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.paidCard}
                    onChange={(event) => {
                      event.stopPropagation();
                      updateAaaFlaggedChecklist(callId, {
                        paidCard: !checklist.paidCard,
                        paidCash: false,
                      });
                    }}
                  />
                  <span>Card payment</span>
                </label>
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.paidCash}
                    onChange={(event) => {
                      event.stopPropagation();
                      updateAaaFlaggedChecklist(callId, {
                        paidCash: !checklist.paidCash,
                        paidCard: false,
                      });
                    }}
                  />
                  <span>Cash payment</span>
                </label>
              </>
            ) : null}
            <label className="checklist-item">
              <input
                type="checkbox"
                checked={checklist.decision === "DECLINED"}
                onChange={(event) => {
                  event.stopPropagation();
                  updateAaaFlaggedChecklist(callId, {
                    decision: checklist.decision === "DECLINED" ? null : "DECLINED",
                  });
                }}
              />
              <span>Declined payment/service</span>
            </label>
            {checklist.decision === "DECLINED" ? (
              <>
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.updateAaa}
                    onChange={(event) => {
                      event.stopPropagation();
                      updateAaaFlaggedChecklist(callId, { updateAaa: !checklist.updateAaa });
                    }}
                  />
                  <span>Update AAA feed</span>
                </label>
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.requestNsr}
                    onChange={(event) => {
                      event.stopPropagation();
                      updateAaaFlaggedChecklist(callId, { requestNsr: !checklist.requestNsr });
                    }}
                  />
                  <span>Request NSR</span>
                </label>
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.clearNsr}
                    onChange={(event) => {
                      event.stopPropagation();
                      updateAaaFlaggedChecklist(callId, { clearNsr: !checklist.clearNsr });
                    }}
                  />
                  <span>Clear call w/ NSR resolution</span>
                </label>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    );
  };

  const hydrateDrawerEditDraft = (call: CallRecord) => {
    setDrawerEditDraft({
      external_call_number: call.external_call_number ?? "",
      source_type: call.source_type ?? "",
      law_agency: call.law_agency ?? "",
      pickup_address: call.pickup_address ?? "",
      dropoff_address: call.dropoff_address ?? "",
      pickup_notes: call.pickup_notes ?? "",
      contact_id: call.contact_id ?? "",
      contact_name: call.contact_name ?? "",
      callback_phone: call.callback_phone ?? "",
      vehicle_description: call.vehicle_description ?? "",
      membership_level: call.membership_level ?? "",
      pricing_category: call.pricing_category ?? "",
      pricing_total:
        typeof call.pricing_total === "number" ? String(call.pricing_total) : "",
      pricing_notes: call.pricing_notes ?? "",
      payment_type: extractNoteValue(call.notes, "Payment Type") ?? "",
      amount_paid: extractNoteValue(call.notes, "Amount Paid") ?? "",
      notes: call.notes ?? "",
      priority_group: call.priority_group ?? "",
    });
  };

  const handleDrawerEditSave = async () => {
    if (!isTauri || !drawerCallId) return;
    setDrawerSaving(true);
    setDrawerCallError(null);
    const isCodOrPpi =
      drawerEditDraft.source_type.trim().toUpperCase() === "COD" ||
      drawerEditDraft.source_type.trim().toUpperCase() === "PPI";
    let updatedNotes = drawerEditDraft.notes;
    if (isCodOrPpi) {
      updatedNotes = upsertNoteValue(updatedNotes, "Payment Type", drawerEditDraft.payment_type);
      updatedNotes = upsertNoteValue(updatedNotes, "Amount Paid", drawerEditDraft.amount_paid);
    }
    const payload = {
      external_call_number: drawerEditDraft.external_call_number.trim() || null,
      source_type: drawerEditDraft.source_type.trim() || null,
      law_agency: drawerEditDraft.law_agency.trim() || null,
      pickup_address: drawerEditDraft.pickup_address.trim() || null,
      dropoff_address: drawerEditDraft.dropoff_address.trim() || null,
      pickup_notes: drawerEditDraft.pickup_notes.trim() || null,
      contact_id: drawerEditDraft.contact_id.trim() || null,
      contact_name: drawerEditDraft.contact_name.trim() || null,
      callback_phone: drawerEditDraft.callback_phone.trim() || null,
      vehicle_description: drawerEditDraft.vehicle_description.trim() || null,
      membership_level: drawerEditDraft.membership_level.trim() || null,
      pricing_category: drawerEditDraft.pricing_category.trim() || null,
      pricing_total: drawerEditDraft.pricing_total.trim()
        ? Number(drawerEditDraft.pricing_total)
        : null,
      pricing_notes: drawerEditDraft.pricing_notes.trim() || null,
      notes: updatedNotes.trim() || null,
      priority_group: drawerEditDraft.priority_group.trim() || null,
    };
    try {
      await invoke("call_update", { callId: drawerCallId, payload });
      setDrawerEditing(false);
      await refreshDashboard();
      if (payload.pickup_address && payload.dropoff_address) {
        try {
          const miles = (await invoke("call_tow_distance", {
            pickupAddress: payload.pickup_address,
            dropoffAddress: payload.dropoff_address,
          })) as number;
          setCallTowMiles((prev) => ({ ...prev, [drawerCallId]: Number(miles) }));
        } catch {
          // ignore tow miles errors on save
        }
      }
      const detail = (await invoke("call_get", { callId: drawerCallId })) as CallDetail;
      setDrawerCallDetail(detail);
      hydrateDrawerEditDraft(detail.call);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDrawerCallError(message);
    } finally {
      setDrawerSaving(false);
    }
  };

  const handleGenerateTrackingLink = async () => {
    const call = drawerCallDetail?.call ?? null;
    if (!call || !drawerCallId) return;
    setTrackingLinkLoading(true);
    setTrackingLinkCopied(false);
    try {
      const serverUrl = (
        (await invoke("settings_get", { keys: ["server.url"] })) as Record<string, string>
      )["server.url"];
      if (!serverUrl) {
        setTrackingLinkUrl(null);
        setTrackingLinkLoading(false);
        setDrawerCallError("Set Server URL in Settings before generating tracking links.");
        return;
      }
      const authToken = (
        (await invoke("settings_get", { keys: ["server.auth_token"] })) as Record<string, string>
      )["server.auth_token"];
      if (!authToken) {
        setTrackingLinkUrl(null);
        setTrackingLinkLoading(false);
        setDrawerCallError("Set Server Auth Token in Settings before generating tracking links.");
        return;
      }
      const pickupCity = call.pickup_address
        ? call.pickup_address.split(",").slice(-2, -1)[0]?.trim() ?? null
        : null;
      const base = serverUrl.replace(/\/+$/, "");
      const resp = await fetch(`${base}/calls/${encodeURIComponent(drawerCallId)}/tracking-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": authToken,
        },
        body: JSON.stringify({
          status: call.status,
          status_updated_at: call.status_updated_at,
          pickup_city: pickupCity,
          eta_minutes: null,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Server returned ${resp.status}: ${detail}`);
      }
      const data = (await resp.json()) as { token: string; url: string };
      setTrackingLinkUrl(data.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDrawerCallError(message);
    } finally {
      setTrackingLinkLoading(false);
    }
  };

  const handleOverMilesCalculate = async () => {
    if (!isTauri) {
      setOverMilesError("Over miles calculation requires the desktop app.");
      return;
    }
    const pickup = overMilesPickup.trim();
    const dropoff = overMilesDropoff.trim();
    if (!pickup || !dropoff) {
      setOverMilesError("Pickup and dropoff addresses are required.");
      return;
    }
    const membership = normalizeMembership(overMilesMembership);
    const coverageByLevel: Record<string, number> = {
      classic: 7,
      plus: 100,
      premier: 200,
      none: 0,
    };
    const coverage = coverageByLevel[membership];
    if (!coverage) {
      setOverMilesError("Select a valid membership level.");
      return;
    }
    setOverMilesLoading(true);
    setOverMilesError(null);
    try {
      const miles = (await invoke("call_tow_distance", {
        pickupAddress: pickup,
        dropoffAddress: dropoff,
      })) as number;
      const roundedMiles = Math.ceil(Number(miles));
      const overMiles = Math.max(0, roundedMiles - coverage);
      const cost = Math.round(overMiles * OVER_MILES_RATE);
      setOverMilesTowMiles(Number(miles));
      setOverMilesRounded(roundedMiles);
      setOverMilesTotal(overMiles);
      setOverMilesCalcCost(cost);
    } catch (error) {
      setOverMilesError(error instanceof Error ? error.message : String(error));
    } finally {
      setOverMilesLoading(false);
    }
  };

  const handleAaaAddRow = (callId: string) => {
    setAaaMemberRows((prev) => {
      const rows = prev[callId] ?? [];
      return {
        ...prev,
        [callId]: [
          ...rows,
          {
            id: `${callId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            calledMember: false,
            timestamp: null,
            notes: "",
          },
        ],
      };
    });
  };

  const handleAaaRemoveRow = (callId: string) => {
    setAaaMemberRows((prev) => {
      const rows = prev[callId] ?? [];
      if (rows.length <= 1) return prev;
      return {
        ...prev,
        [callId]: rows.slice(0, -1),
      };
    });
  };

  const handleAaaRowUpdate = (
    callId: string,
    rowId: string,
    updates: Partial<AaaMemberRow>
  ) => {
    setAaaMemberRows((prev) => ({
      ...prev,
      [callId]: (prev[callId] ?? []).map((row) =>
        row.id === rowId ? { ...row, ...updates } : row
      ),
    }));
  };

  useEffect(() => {
    if (storageCalc.days == null) return;
    if (storageCalc.days < 3) return;
    setStorageCalc((prev) => {
      const lienFee = storageLienOverride ? 70 : 35;
      const previousLien = prev.lienFee ?? 0;
      const previousTotal = prev.grandTotal ?? 0;
      return {
        ...prev,
        lienFee,
        grandTotal: previousTotal - previousLien + lienFee,
      };
    });
  }, [storageLienOverride]);

  useEffect(() => {
    if (overMilesMode !== "existing") return;
    const selected = overMilesCallOptions.find((call) => call.call_id === overMilesCallId);
    if (!selected) return;
    setOverMilesPickup(selected.pickup_address ?? "");
    setOverMilesDropoff(selected.dropoff_address ?? "");
    setOverMilesMembership(
      selected.membership_level ? normalizeMembership(selected.membership_level) : ""
    );
  }, [overMilesMode, overMilesCallId, overMilesCallOptions]);

  useEffect(() => {
    if (overMilesMode !== "existing") return;
    if (!overMilesCallId) return;
    if (!overMilesPickup.trim() || !overMilesDropoff.trim() || !overMilesMembership) return;
    if (overMilesLoading) return;
    void handleOverMilesCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overMilesMode, overMilesCallId, overMilesPickup, overMilesDropoff, overMilesMembership]);

  useEffect(() => {
    if (towingCalc.days == null || towingCalc.days < 3) return;
    setTowingCalc((prev) => {
      const lienFee = towingLienOverride ? 70 : 35;
      const previousLien = prev.lienFee ?? 0;
      const previousTotal = prev.total ?? 0;
      return {
        ...prev,
        lienFee,
        total: previousTotal - previousLien + lienFee,
      };
    });
  }, [towingLienOverride, towingCalc.days]);

  useEffect(() => {
    if (chpCalc.days == null || chpCalc.days < 3) return;
    setChpCalc((prev) => {
      const lienFee = chpLienOverride ? 70 : 35;
      const previousLien = prev.lienFee ?? 0;
      const previousTotal = prev.total ?? 0;
      return {
        ...prev,
        lienFee,
        total: previousTotal - previousLien + lienFee,
      };
    });
  }, [chpLienOverride, chpCalc.days]);

  useEffect(() => {
    if (sdCalc.days == null || sdCalc.days < 3) return;
    setSdCalc((prev) => {
      const lienFee = sdLienOverride ? 70 : 35;
      const previousLien = prev.lienFee ?? 0;
      const previousTotal = prev.total ?? 0;
      return {
        ...prev,
        lienFee,
        total: previousTotal - previousLien + lienFee,
      };
    });
  }, [sdLienOverride, sdCalc.days]);

  useEffect(() => {
    if (sheriffCalc.days == null || sheriffCalc.days < 3) return;
    setSheriffCalc((prev) => {
      const lienFee = sheriffLienOverride ? 70 : 35;
      const previousLien = prev.lienFee ?? 0;
      const previousTotal = prev.total ?? 0;
      return {
        ...prev,
        lienFee,
        total: previousTotal - previousLien + lienFee,
      };
    });
  }, [sheriffLienOverride, sheriffCalc.days]);

  useEffect(() => {
    if (cvpdCalc.days == null || cvpdCalc.days < 3) return;
    setCvpdCalc((prev) => {
      const lienFee = cvpdLienOverride ? 70 : 35;
      const previousLien = prev.lienFee ?? 0;
      const previousTotal = prev.total ?? 0;
      return {
        ...prev,
        lienFee,
        total: previousTotal - previousLien + lienFee,
      };
    });
  }, [cvpdLienOverride, cvpdCalc.days]);

  const filteredDriverReport = useMemo(() => {
    if (reportStatusFilter === "ALL") return driverReport;
    return driverReport.filter((item) => item.outcome === reportStatusFilter);
  }, [driverReport, reportStatusFilter]);

  const storageCalendarCells = useMemo(
    () => buildMonthGrid(storageCalendarMonth),
    [storageCalendarMonth]
  );
  const storageIsLienApplied = storageCalc.days != null && storageCalc.days >= 3;
  const refreshDashboard = useCallback(async () => {
    if (!isTauri) return;
    setDashboardLoading(true);
    try {
      const data = (await invoke("dashboard_get")) as DashboardSnapshot;
      setDashboard(data);
      setDashboardError(null);
      if (data.settings?.dock_side === "left" || data.settings?.dock_side === "right") {
        setPanelSide(data.settings.dock_side);
      }
      if (typeof data.settings?.always_on_top === "boolean") {
        setAlwaysOnTop(data.settings.always_on_top);
      }
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Failed to load dashboard");
    } finally {
      setDashboardLoading(false);
    }
  }, [isTauri]);

  const refreshAaaCalls = useCallback(async () => {
    if (!isTauri) return;
    setAaaCallsLoading(true);
    try {
      const data = (await invoke("aaa_calls_list", { limit: 400 })) as AaaMemberCall[];
      setAaaCalls(data);
      setAaaCallsError(null);
    } catch (error) {
      setAaaCallsError(error instanceof Error ? error.message : "Failed to load AAA calls");
    } finally {
      setAaaCallsLoading(false);
    }
  }, [isTauri]);

  const loadCallHistory = useCallback(async () => {
    if (!isTauri) return;
    setHistoryLoading(true);
    try {
      const data = (await invoke("calls_history", {
        filters: {
          search: historySearch || null,
          source_type: historySourceFilter || null,
          status: historyStatusFilter || null,
          date_from: historyDateFrom || null,
          date_to: historyDateTo || null,
          limit: 300,
        },
      })) as CallHistoryItem[];
      setHistoryItems(data);
      setHistoryError(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Failed to load call history");
    } finally {
      setHistoryLoading(false);
    }
  }, [isTauri, historySearch, historySourceFilter, historyStatusFilter, historyDateFrom, historyDateTo]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (activeTabId !== "daily-report") return;
    void refreshAaaCalls();
  }, [activeTabId, refreshAaaCalls]);

  useEffect(() => {
    if (activeTabId !== "history") return;
    void loadCallHistory();
  }, [activeTabId, loadCallHistory]);

  useEffect(() => {
    if (!isDrawerWindow || drawerMode !== "call-detail" || !drawerCallId) return;
    let active = true;
    setDrawerCallLoading(true);
    setDrawerCallError(null);
    setTrackingLinkUrl(null);
    setTrackingLinkCopied(false);
    (async () => {
      try {
        const detail = (await invoke("call_get", { callId: drawerCallId })) as CallDetail;
        if (!active) return;
        setDrawerCallDetail(detail);
        hydrateDrawerEditDraft(detail.call);
        setDrawerEditing(drawerEdit);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setDrawerCallError(message);
      } finally {
        if (!active) return;
        setDrawerCallLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerWindow, drawerMode, drawerCallId, drawerEdit]);

  useEffect(() => {
    if (!isTauri) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    let active = true;
    setSearchLoading(true);
    setSearchOpen(true);
    const timer = window.setTimeout(() => {
      void invoke("search", { query: q, limit: 12 })
        .then((res) => {
          if (!active) return;
          setSearchResults(res as SearchResults);
        })
        .catch(() => {
          if (!active) return;
          setSearchResults({ drivers: [], calls: [] });
        })
        .finally(() => {
          if (!active) return;
          setSearchLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isTauri, searchQuery]);

  const dashboardDrivers = useMemo(() => dashboard?.drivers ?? [], [dashboard]);
  const dashboardUnassigned = useMemo(() => dashboard?.unassigned_calls ?? [], [dashboard]);

  const refreshSchedule = useCallback(async () => {
    if (!isTauri) return;
    setScheduleLoading(true);
    try {
      const driversList = (await invoke("driver_list")) as DriverRecord[];
      const weekStart = startOfWeek(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const shiftsList = (await invoke("shift_list", {
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
      })) as DriverShiftRecord[];
      setScheduleDrivers(driversList);
      setScheduleShifts(shiftsList);
      setScheduleError(null);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Failed to load schedule");
    } finally {
      setScheduleLoading(false);
    }
  }, [isTauri]);

  useEffect(() => {
    void refreshSchedule();
  }, [refreshSchedule]);

  const refreshDriverReport = useCallback(async () => {
    if (!isTauri) return;
    setDriverReportLoading(true);
    try {
      const start = startOfDay(dateInputToDate(reportStartDate));
      const end = endOfDay(dateInputToDate(reportEndDate));
      const report = (await invoke("report_driver_calls", {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      })) as DriverCallReportItem[];
      setDriverReport(report);
      setDriverReportError(null);
    } catch (error) {
      setDriverReportError(error instanceof Error ? error.message : "Failed to load report");
    } finally {
      setDriverReportLoading(false);
    }
  }, [isTauri, reportStartDate, reportEndDate]);

  useEffect(() => {
    void refreshDriverReport();
  }, [refreshDriverReport]);

  useEffect(() => {
    if (!isTauri) return;
    if (activeTabId !== "daily-report") return;
    let active = true;
    const loadDailyReport = async () => {
      setDailyReportLoading(true);
      setDailyReportDetails({});
      try {
        const today = new Date(nowMs);
        const start = startOfDay(today);
        const end = endOfDay(today);
        const report = (await invoke("report_driver_calls", {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        })) as DriverCallReportItem[];
        if (!active) return;
        setDailyReportItems(report);
        setDailyReportError(null);
        const details = await Promise.all(
          report.map(async (item) => {
            const detail = (await invoke("call_get", { callId: item.call_id })) as CallDetail;
            return [item.call_id, detail] as const;
          })
        );
        if (!active) return;
        const map: Record<string, CallDetail> = {};
        details.forEach(([callId, detail]) => {
          map[callId] = detail;
        });
        setDailyReportDetails(map);
      } catch (error) {
        if (!active) return;
        setDailyReportError(error instanceof Error ? error.message : "Failed to load daily report");
      } finally {
        if (!active) return;
        setDailyReportLoading(false);
      }
    };
    void loadDailyReport();
    return () => {
      active = false;
    };
  }, [activeTabId, isTauri, nowMs]);

  useEffect(() => {
    if (activeTabId !== "daily-report") return;
    const key = `daily-report-notes-${dateKey(new Date(nowMs))}`;
    const stored = localStorage.getItem(key);
    setDailyReportNotes(stored ?? "");
  }, [activeTabId, nowMs]);

  useEffect(() => {
    if (activeTabId !== "daily-report") return;
    const key = `daily-report-notes-${dateKey(new Date(nowMs))}`;
    localStorage.setItem(key, dailyReportNotes);
  }, [activeTabId, dailyReportNotes, nowMs]);

  useEffect(() => {
    if (isDrawerWindow) return;
    document.body.classList.toggle("nav-collapsed", isCollapsed);
    document.body.classList.toggle("floating-mode", isFloatingWindow);
  }, [isCollapsed, isFloatingWindow]);

  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (isDrawerWindow) return;
    localStorage.setItem(PANEL_SIDE_KEY, panelSide);
    const applyWindowSettings = async () => {
      try {
        const win = getCurrentWindow();
        const monitor = await primaryMonitor();
        await win.setResizable(true);
        await win.setAlwaysOnTop(alwaysOnTop);
        if (!monitor) return;
        const size = await win.outerSize();
        const x =
          panelSide === "left"
            ? monitor.position.x
            : monitor.position.x + monitor.size.width - size.width;
        const y = monitor.position.y;
        await win.setPosition(new LogicalPosition(x, y));
      } catch {
        // Ignore window errors when not running in Tauri.
      }
    };
    void applyWindowSettings();
  }, [panelSide, alwaysOnTop, isDrawerWindow]);

  useEffect(() => {
    if (isDrawerWindow) return;
    const win = getCurrentWindow();
    let active = true;
    const applyForMonitor = async () => {
      try {
        const pos = await win.outerPosition();
        const monitor = await monitorFromPoint(pos.x, pos.y);
        if (!monitor || !active) return;
        const size = await win.outerSize();
        const x =
          panelSide === "left"
            ? monitor.position.x
            : monitor.position.x + monitor.size.width - size.width;
        const y = monitor.position.y;
        await win.setPosition(new LogicalPosition(x, y));
        await positionDrawerWindow();
      } catch {
        // Ignore window errors when not running in Tauri.
      }
    };
    const setup = async () => {
      try {
        await applyForMonitor();
        const unlisten = await win.onMoved(() => {
          void applyForMonitor();
        });
        const unlistenResize = await win.onResized(() => {
          void applyForMonitor();
        });
        return () => {
          unlisten();
          unlistenResize();
        };
      } catch {
        return () => undefined;
      }
    };
    const cleanupPromise = setup();
    return () => {
      active = false;
      void cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [panelSide, isDrawerWindow]);

  useEffect(() => {
    if (!isDrawerWindow) return;
    const win = getCurrentWindow();
    const setup = async () => {
      const unlisten = await win.onCloseRequested(() => {
        void emit("drawer-closed");
      });
      return () => unlisten();
    };
    const cleanupPromise = setup();
    return () => {
      void cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [isDrawerWindow]);

  useEffect(() => {
    if (isDrawerWindow) return;
    const setup = async () => {
      const unlisten = await listen("drawer-closed", () => {
        setIsAddCallOpen(false);
        drawerModeRef.current = null;
      });
      return () => unlisten();
    };
    const cleanupPromise = setup();
    return () => {
      void cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [isDrawerWindow]);

  useEffect(() => {
    if (!isTauri || isDrawerWindow) return;
    const setup = async () => {
      const unlisten = await listen<OcrShortcutPayload>("ocr-shortcut", (event) => {
        if (!isAddCallOpen) {
          showToast("Open Add Call to capture an OCR screenshot.");
          return;
        }
        if (callDraft.callType !== "AAA") {
          showToast("OCR capture is only available for AAA calls.");
          return;
        }
        if (ocrLoading) {
          showToast("OCR capture already running.");
          return;
        }
        void handleOcrCapture(event.payload.templateType);
      });
      return () => unlisten();
    };
    const cleanupPromise = setup();
    return () => {
      void cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [isTauri, isDrawerWindow, isAddCallOpen, callDraft.callType, ocrLoading]);

  useEffect(() => {
    if (!isTauri) return;
    if (!isDrawerWindow || drawerMode !== "weekly-schedule") return;
    const applyWeeklyDrawerSize = async () => {
      const grid = weeklyGridRef.current;
      if (!grid) return;

      const INCH = 48; // pixels
      const totalPadding = INCH * 2;

      const measuredGridWidth = Math.ceil(grid.scrollWidth); // current grid width
      const measuredGridHeight = Math.ceil(grid.scrollHeight); // current grid height

      const targetDrawerWidth = measuredGridWidth + totalPadding;
      const targetDrawerHeight = measuredGridHeight + totalPadding;

      // Set window size to fit grid + padding
      try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(targetDrawerWidth, targetDrawerHeight));
        await setWindowSizeConstraintsSafe(win, {
          minWidth: Math.max(560, targetDrawerWidth - 220),
          minHeight: 400,
        });
      } catch {
        // ignore measurement sizing failures
      }
    };
    const frame = window.requestAnimationFrame(() => {
      void applyWeeklyDrawerSize();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isTauri, isDrawerWindow, drawerMode]);

  useEffect(() => {
    if (isDrawerWindow) return;
    const win = getCurrentWindow();
    const setup = async () => {
      const unlisten = await win.onCloseRequested(async () => {
        const drawer = await WebviewWindow.getByLabel(DRAWER_LABEL);
        if (drawer) {
          await drawer.close();
        }
      });
      return () => unlisten();
    };
    const cleanupPromise = setup();
    return () => {
      void cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [isDrawerWindow]);

  const closeCurrentNonMainWindow = useCallback(async () => {
    if (isTauri) {
      try {
        await emit("drawer-closed");
      } catch {
        // ignore
      }
      try {
        const win = getCurrentWindow();
        await win.close();
      } catch {
        // ignore
      }
      return;
    }
    window.close();
  }, [isTauri]);

  const handleNonMainEscapeCapture = useCallback(
    (event: React.KeyboardEvent) => {
      if (!(isDrawerWindow || isFloatingWindow || isReportWindow)) return;
      if (!isEscapeReactEvent(event)) return;
      const now = Date.now();
      if (now - lastEscapeHandledAtRef.current < 150) return;
      lastEscapeHandledAtRef.current = now;
      event.preventDefault();
      event.stopPropagation();
      void closeCurrentNonMainWindow();
    },
    [isDrawerWindow, isFloatingWindow, isReportWindow, closeCurrentNonMainWindow]
  );

  useEffect(() => {
    if (!(isDrawerWindow || isFloatingWindow || isReportWindow)) return;
    const frame = window.requestAnimationFrame(() => {
      nonMainShellRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isDrawerWindow, isFloatingWindow, isReportWindow]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isEscapeKey(event)) {
        if (isDrawerWindow || isFloatingWindow || isReportWindow) return;
        event.preventDefault();
        event.stopPropagation();

        if (ocrConfirm) {
          setOcrConfirm(null);
          return;
        }
        if (editingShift) {
          setEditingShift(null);
          return;
        }
        if (isAddShiftOpen) {
          setIsAddShiftOpen(false);
          return;
        }
        if (isDeleteEmployeeOpen) {
          setIsDeleteEmployeeOpen(false);
          return;
        }
        if (isAddEmployeeOpen) {
          setIsAddEmployeeOpen(false);
          return;
        }
        if (isClearWeekOpen) {
          setIsClearWeekOpen(false);
          return;
        }
        if (isAddCallOpen) {
          setIsAddCallOpen(false);
          return;
        }
        if (floatingDetail) {
          setFloatingDetail(null);
          setFloatingDetailCall(null);
          setFloatingDetailError(null);
          setFloatingDetailLoading(false);
          return;
        }
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.altKey) return;

      if (event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        openAddCallDrawer();
        setCallDraft((prev) => ({
          ...prev,
          callType: "AAA",
          lawAgency: "",
        }));
        return;
      }

      if (!event.shiftKey) {
        const number = Number(event.key);
        if (!Number.isInteger(number)) return;
        if (number < 1 || number > tabs.length) return;

        event.preventDefault();
        const nextIndex = number - 1;
        setActiveIndex(nextIndex);
        buttonRefs.current[nextIndex]?.focus();
        return;
      }

      if (activeTabId !== "settings" && selectedDriverId) {
        const target = event.target as HTMLElement | null;
        const isInput =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);
        if (isInput) return;
        const key = event.key.toLowerCase();
        if (key === "a") {
          event.preventDefault();
          void handleAvailabilityChange(selectedDriverId, "AVAILABLE");
          return;
        }
        if (key === "l") {
          event.preventDefault();
          void handleAvailabilityChange(selectedDriverId, "ON_LUNCH");
          return;
        }
        if (key === "b") {
          event.preventDefault();
          void handleAvailabilityChange(selectedDriverId, "BUSY");
          return;
        }
        if (key === "o") {
          event.preventDefault();
          void handleAvailabilityChange(selectedDriverId, "OFF_SHIFT");
          return;
        }
      }

      if (activeTabId !== "settings") return;

      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        setIsAddEmployeeOpen(true);
      } else if (key === "a") {
        event.preventDefault();
        setIsAddShiftOpen(true);
      } else if (key === "k") {
        event.preventDefault();
        setIsClearWeekOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [
    activeTabId,
    isDrawerWindow,
    isFloatingWindow,
    isReportWindow,
    closeCurrentNonMainWindow,
    ocrConfirm,
    editingShift,
    isAddShiftOpen,
    isDeleteEmployeeOpen,
    isAddEmployeeOpen,
    isClearWeekOpen,
    isAddCallOpen,
    floatingDetail,
    searchOpen,
  ]);

  useEffect(() => {
    if (!isAddShiftOpen) return;
    if (scheduleDrivers.length === 0) return;
    setShiftDraft((current) => ({
      ...current,
      employeeId: current.employeeId || scheduleDrivers[0].id,
    }));
  }, [scheduleDrivers, isAddShiftOpen]);

  useEffect(() => {
    if (!isAddEmployeeOpen) return;
    requestAnimationFrame(() => {
      employeeNameInputRef.current?.focus();
      employeeNameInputRef.current?.select();
    });
  }, [isAddEmployeeOpen]);

  useEffect(() => {
    if (!isAddShiftOpen) return;
    requestAnimationFrame(() => {
      shiftEmployeeSelectRef.current?.focus();
    });
  }, [isAddShiftOpen]);

  useEffect(() => {
    if (!isAddCallOpen) return;
    if (callDraft.callType !== "LAW_ENFORCEMENT") return;
    if (callDraft.leTimestamp) return;
    setCallDraft((prev) => ({ ...prev, leTimestamp: formatTimestamp(Date.now()) }));
  }, [isAddCallOpen, callDraft.callType, callDraft.leTimestamp]);

  useEffect(() => {
    if (!isAddCallOpen) return;
    if (callDraft.callType !== "COD") return;
    if (callDraft.codTimestamp) return;
    setCallDraft((prev) => ({ ...prev, codTimestamp: formatTimestamp(Date.now()) }));
  }, [isAddCallOpen, callDraft.callType, callDraft.codTimestamp]);

  useEffect(() => {
    if (!isAddCallOpen) return;
    if (callDraft.callType !== "PPI") return;
    if (callDraft.ppiTimestamp) return;
    setCallDraft((prev) => ({ ...prev, ppiTimestamp: formatTimestamp(Date.now()) }));
  }, [isAddCallOpen, callDraft.callType, callDraft.ppiTimestamp]);

  useEffect(() => {
    if (!isAddCallOpen || isDrawerWindow) return;
    setAddCallModalHeight(ADD_CALL_DEFAULT_HEIGHT);
  }, [isAddCallOpen, isDrawerWindow]);

  const startAddCallHeightResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isAddCallOpen || isDrawerWindow) return;
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = addCallModalHeight ?? ADD_CALL_DEFAULT_HEIGHT;
      const maxHeight = Math.max(260, window.innerHeight - 32);
      const minHeight = 220;

      const onMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY;
        const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));
        setAddCallModalHeight(nextHeight);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isAddCallOpen, isDrawerWindow, addCallModalHeight]
  );

  useEffect(() => {
    if (callDraft.callType !== "COD") return;
    const pickup = callDraft.pickupLocation.trim();
    const dropoff = callDraft.dropoffLocation.trim();
    if (!pickup || !dropoff) {
      setTowMiles(null);
      setTowMilesError(null);
      return;
    }
    if (!isTauri) {
      setTowMilesError("Tow miles requires the desktop app.");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTowMilesLoading(true);
      setTowMilesError(null);
      const payload = {
        origin: pickup,
        destination: dropoff,
        origin_lat: null,
        origin_lng: null,
        destination_lat: null,
        destination_lng: null,
      };
      invoke("google_distance_matrix", payload)
        .then((result: any) => {
          if (cancelled) return;
          const meters = result?.meters ?? 0;
          const miles = Number(meters) * 0.000_621_371;
          setTowMiles(miles);
        })
        .catch((error) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : String(error);
          setTowMilesError(message);
          setTowMiles(null);
        })
        .finally(() => {
          if (cancelled) return;
          setTowMilesLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [callDraft.callType, callDraft.pickupLocation, callDraft.dropoffLocation, isTauri]);

  const closeFloatingDetail = useCallback(() => {
    setFloatingDetail(null);
    setFloatingDetailCall(null);
    setFloatingDetailError(null);
    setFloatingDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    const activeCalls = dashboardDrivers
      .map((driver) => driver.active_call)
      .filter((call): call is CallSummary => Boolean(call))
      .filter((call) => call.pickup_address && call.dropoff_address);
    const queuedCalls = dashboardDrivers
      .flatMap((driver) => driver.pending_queue)
      .filter((call) => call.pickup_address && call.dropoff_address);
    const unassignedCalls = dashboardUnassigned.filter(
      (call) => call.pickup_address && call.dropoff_address
    );
    const callsToFetch = [...activeCalls, ...queuedCalls, ...unassignedCalls];
    let cancelled = false;
    callsToFetch.forEach((call) => {
      if (!call.dropoff_address) return;
      if (callTowMiles[call.call_id] != null || callTowMilesLoading[call.call_id]) return;
      setCallTowMilesLoading((prev) => ({ ...prev, [call.call_id]: true }));
      setCallTowMilesError((prev) => {
        const next = { ...prev };
        delete next[call.call_id];
        return next;
      });
      void invoke("call_tow_distance", {
        pickupAddress: call.pickup_address,
        dropoffAddress: call.dropoff_address,
      })
        .then((value) => {
          if (cancelled) return;
          const miles = typeof value === "number" ? value : Number(value);
          setCallTowMiles((prev) => ({ ...prev, [call.call_id]: miles }));
        })
        .catch((error) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : String(error);
          setCallTowMilesError((prev) => ({ ...prev, [call.call_id]: message }));
        })
        .finally(() => {
          if (cancelled) return;
          setCallTowMilesLoading((prev) => ({ ...prev, [call.call_id]: false }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [dashboardDrivers, isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    if (dashboardDrivers.length === 0) return;
    let active = true;
    void invoke("driver_pause_lunch_map")
      .then((rows) => {
        if (!active) return;
        const map: Record<string, string> = {};
        (rows as Array<[string, string]>).forEach(([driverId, ts]) => {
          map[driverId] = ts;
        });
        setPauseLunchAt(map);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, [dashboardDrivers.length, isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    if (dashboardDrivers.length === 0) return;
    let active = true;
    void invoke("driver_lunch_start_map")
      .then((rows) => {
        if (!active) return;
        const map: Record<string, string> = {};
        (rows as Array<[string, string]>).forEach(([driverId, ts]) => {
          map[driverId] = ts;
        });
        setLunchStartAt(map);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, [dashboardDrivers.length, isTauri]);

  // Auto-finish lunch when timer reaches 0
  useEffect(() => {
    if (!isTauri) return;
    dashboardDrivers.forEach((driver) => {
      if (driver.availability_status !== "ON_LUNCH") return;
      // Don't auto-finish if currently paused
      if (lunchPausedSince[driver.driver_id]) return;
      // Guard against repeated calls while waiting for dashboard refresh
      if (lunchAutoEndingRef.current.has(driver.driver_id)) return;
      const todayShift = scheduleShiftLookup.get(
        `${driver.driver_id}-${dateKey(new Date(nowMs))}`
      );
      const remaining = getLunchRemaining(
        driver,
        todayShift,
        nowMs,
        pauseLunchAt[driver.driver_id],
        lunchStartAt[driver.driver_id],
        lunchAccumPausedMs[driver.driver_id],
        null
      );
      if (remaining === "0 min") {
        lunchAutoEndingRef.current.add(driver.driver_id);
        void handleAvailabilityChange(driver.driver_id, "AVAILABLE").then(() => {
          lunchAutoEndingRef.current.delete(driver.driver_id);
        });
      }
    });
  // Intentionally omitting handleAvailabilityChange and other dashboard state from deps –
  // this effect runs every second (nowMs) and reads latest values via the stale closure,
  // which is acceptable since handleAvailabilityChange calls invoke() and refreshDashboard().
  // Including it would cause infinite re-renders because it is not memoized.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, isTauri]);

  useEffect(() => {
    if (!floatingDetail) return;
    const handleKey = (event: KeyboardEvent) => {
      if (isEscapeKey(event)) {
        closeFloatingDetail();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [floatingDetail, closeFloatingDetail]);

  useEffect(() => {
    if (activeTabId === "calls") return;
    if (!floatingDetail) return;
    closeFloatingDetail();
  }, [activeTabId, floatingDetail, closeFloatingDetail]);

  useEffect(() => {
    setDriverLocationDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      dashboardDrivers.forEach((driver) => {
        if (next[driver.driver_id] === undefined) {
          next[driver.driver_id] = driver.last_location ?? "";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [dashboardDrivers]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    if (activeTabId !== "settings") return;
    let active = true;
    setPriorityLoading(true);
    const keys = [
      "priority.group.LAW_ENFORCEMENT",
      "priority.group.AAA",
      "priority.group.PPI",
      "priority.group.COD",
      "geocode.test_mode",
      "tesseract.path",
      "server.url",
      "server.auth_token",
    ];
    void invoke("settings_get", { keys })
      .then((res) => {
        if (!active) return;
        const values = res as Record<string, string>;
        setPrioritySettings(values);
        setGeocodeTestMode((values["geocode.test_mode"] ?? "false") === "true");
        setTesseractPath(values["tesseract.path"] ?? "");
        setServerUrl(values["server.url"] ?? "");
        setServerAuthToken(values["server.auth_token"] ?? "");
      })
      .finally(() => {
        if (!active) return;
        setPriorityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTabId, isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    if (activeTabId !== "settings") return;
    let active = true;
    setEventLogLoading(true);
    setEventLogError(null);
    const filters = {
      start_date: null,
      end_date: null,
      search: eventLogSearch || null,
      entity_type: eventLogEntityType || null,
      event_type: eventLogEventType || null,
      limit: 1000,
    };
    void invoke("event_log_list", { filters })
      .then((items) => {
        if (!active) return;
        setEventLogItems(items as EventLogItem[]);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setEventLogError(message);
      })
      .finally(() => {
        if (!active) return;
        setEventLogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    activeTabId,
    isTauri,
    eventLogSearch,
    eventLogEntityType,
    eventLogEventType,
  ]);

  useEffect(() => {
    if (!isTauri) return;
    if (activeTabId !== "settings") return;
    const todayKey = dateKey(new Date(nowMs));
    const storageKey = "event-log-last-clear";
    const timeKey = "event-log-last-clear-time";
    const lastClear = localStorage.getItem(storageKey);
    const lastTime = localStorage.getItem(timeKey);
    setEventLogLastCleared(lastTime);
    if (lastClear === todayKey) return;
    let active = true;
    const clearDaily = async () => {
      try {
        await invoke("event_log_clear");
        if (!active) return;
        setEventLogItems([]);
        setEventLogError(null);
        const now = new Date().toISOString();
        localStorage.setItem(storageKey, todayKey);
        localStorage.setItem(timeKey, now);
        setEventLogLastCleared(now);
      } catch {
        // ignore
      }
    };
    void clearDaily();
    return () => {
      active = false;
    };
  }, [activeTabId, isTauri, nowMs]);

  useEffect(() => {
    if (!aaaCalls.length) return;
    setAaaMemberRows((prev) => {
      const next: Record<string, AaaMemberRow[]> = {};
      aaaCalls.forEach((call) => {
        const existing = prev[call.call_id];
        if (existing && existing.length > 0) {
          next[call.call_id] = existing;
        } else {
          next[call.call_id] = [
            {
              id: `${call.call_id}-${Date.now()}`,
              calledMember: false,
              timestamp: null,
              notes: "",
            },
          ];
        }
      });
      return next;
    });
  }, [aaaCalls]);

  useEffect(() => {
    if (captureCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setCaptureCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [captureCountdown]);

  const handleOpenReportWindow = async (kind: "daily" | "driver") => {
    const label = `report-${kind}`;
    const url = `${window.location.pathname}?report=${kind}`;
    if (isTauri) {
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.setFocus();
        return;
      }
      new WebviewWindow(label, {
        url,
        title: kind === "daily" ? "Daily Report" : "Driver Report",
        width: 1100,
        height: 800,
        resizable: true,
      });
      return;
    }
    window.open(url, label, "width=1100,height=800");
  };

  const handleAddEmployee = async (event: FormEvent) => {
    event.preventDefault();
    if (!employeeDraft.name.trim() || !isTauri) return;
    await invoke("driver_create", { displayName: employeeDraft.name.trim() });
    setEmployeeDraft({ name: "" });
    setIsAddEmployeeOpen(false);
    await refreshSchedule();
    await refreshDashboard();
    await refreshDriverReport();
    await refreshDriverReport();
  };

  const handleAddShift = async (event: FormEvent) => {
    event.preventDefault();
    if (!shiftDraft.employeeId || !isTauri) return;
    const uniqueDays = Array.from(new Set(shiftDraft.days));
    const weekStart = startOfWeek(new Date(nowMs));

    for (const day of uniqueDays) {
      const dayIndex = days.indexOf(day);
      const targetDate = new Date(weekStart);
      targetDate.setDate(weekStart.getDate() + dayIndex);
      const shiftStart = timeInputToIso(targetDate, shiftDraft.start);
      const shiftEnd = timeInputToIso(targetDate, shiftDraft.end);
      const lunchStart = shiftDraft.lunchOverride
        ? timeInputToIso(targetDate, shiftDraft.lunchStart)
        : new Date(new Date(shiftStart).getTime() + 4 * 60 * 60 * 1000).toISOString();
      const lunchEnd = shiftDraft.lunchOverride
        ? timeInputToIso(targetDate, shiftDraft.lunchEnd)
        : new Date(new Date(shiftStart).getTime() + 5 * 60 * 60 * 1000).toISOString();

      await invoke("shift_create", {
        payload: {
          driverId: shiftDraft.employeeId,
          shiftStart,
          shiftEnd,
          lunchStart,
          lunchEnd,
          shiftLabel: null,
        },
      });
    }

    setIsAddShiftOpen(false);
    setShiftDraft((prev) => ({
      ...prev,
      lunchOverride: false,
    }));
    await refreshSchedule();
    await refreshDashboard();
    await refreshDriverReport();
  };

  const handleEditShiftSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingShift || !isTauri) return;
    const baseDate = new Date(editingShift.shift_start);
    const shiftStart = timeInputToIso(baseDate, editDraft.start);
    const shiftEnd = timeInputToIso(baseDate, editDraft.end);
    const lunchStart = editDraft.lunchOverride
      ? timeInputToIso(baseDate, editDraft.lunchStart)
      : new Date(new Date(shiftStart).getTime() + 4 * 60 * 60 * 1000).toISOString();
    const lunchEnd = editDraft.lunchOverride
      ? timeInputToIso(baseDate, editDraft.lunchEnd)
      : new Date(new Date(shiftStart).getTime() + 5 * 60 * 60 * 1000).toISOString();

    await invoke("shift_update", {
      shiftId: editingShift.id,
      payload: {
        shiftStart,
        shiftEnd,
        lunchStart,
        lunchEnd,
        shiftLabel: editingShift.shift_label ?? null,
      },
    });
    setEditingShift(null);
    setEditDraft((prev) => ({ ...prev, lunchOverride: false }));
    await refreshSchedule();
    await refreshDashboard();
    await refreshDriverReport();
  };

  const handleDeleteShift = async () => {
    if (!editingShift || !isTauri) return;
    await invoke("shift_delete", { shiftId: editingShift.id });
    setEditingShift(null);
    await refreshSchedule();
    await refreshDashboard();
    await refreshDriverReport();
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!isTauri) return;
    await invoke("driver_archive", { driverId: employeeId });
    await refreshSchedule();
    await refreshDashboard();
    await refreshDriverReport();
  };

  function handleClearWeek() {
    setIsClearWeekOpen(true);
  }

  const handleConfirmClearWeek = async () => {
    if (!isTauri) return;
    for (const shift of scheduleShifts) {
      await invoke("shift_delete", { shiftId: shift.id });
    }
    setIsClearWeekOpen(false);
    await refreshSchedule();
    await refreshDashboard();
    await refreshDriverReport();
  };

  const handleCancelClearWeek = () => {
    setIsClearWeekOpen(false);
  };

  const statusOptions: CallStatus[] = [
    "ACTIVE",
    "EN_ROUTE",
    "94",
    "95",
    "97",
    "IN_TOW",
    "98",
  ];

  const statusToClass = (status: CallStatus) => {
    if (status === "EN_ROUTE") return "en-route";
    if (status === "IN_TOW") return "in-tow";
    return status.toLowerCase();
  };

  const getChecklist = (callId: string) =>
    clearChecklist[callId] ?? {
      updateAaa: false,
      setResolution: false,
      clearConsole: false,
    };

  const isChecklistComplete = (callId: string) => {
    const checklist = getChecklist(callId);
    return (
      checklist.updateAaa &&
      checklist.setResolution &&
      checklist.clearConsole
    );
  };

  const toggleChecklist = (callId: string, key: keyof ReturnType<typeof getChecklist>) => {
    setClearChecklist((prev) => {
      const current = prev[callId] ?? {
        updateAaa: false,
        setResolution: false,
        clearConsole: false,
      };
      return {
        ...prev,
        [callId]: { ...current, [key]: !current[key] },
      };
    });
    setClearErrors((prev) => {
      const next = { ...prev };
      delete next[callId];
      return next;
    });
  };

  const getNsrChecklist = (callId: string) =>
    nsrChecklist[callId] ?? {
      standbyFive: false,
      contactMember: false,
      updateAaa: false,
      requestNsr: false,
      clearCallNsr: false,
    };

  const isNsrChecklistComplete = (callId: string) => {
    const checklist = getNsrChecklist(callId);
    return (
      checklist.standbyFive &&
      checklist.contactMember &&
      checklist.updateAaa &&
      checklist.requestNsr &&
      checklist.clearCallNsr
    );
  };

  const toggleNsrChecklist = (callId: string, key: keyof ReturnType<typeof getNsrChecklist>) => {
    setNsrChecklist((prev) => {
      const current = prev[callId] ?? {
        standbyFive: false,
        contactMember: false,
        updateAaa: false,
        requestNsr: false,
        clearCallNsr: false,
      };
      return {
        ...prev,
        [callId]: { ...current, [key]: !current[key] },
      };
    });
    setNsrErrors((prev) => {
      const next = { ...prev };
      delete next[callId];
      return next;
    });
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  };

  const handleDriverLocationSave = async (driver: DriverDashboardItem) => {
    if (!isTauri) return;
    const rawValue = driverLocationDrafts[driver.driver_id] ?? "";
    const nextValue = sanitizeLocation(rawValue).trim();
    const currentValue = (driver.last_location ?? "").trim();
    if (nextValue === currentValue) return;
    try {
      await invoke("driver_update", {
        driverId: driver.driver_id,
        payload: { last_location: nextValue },
      });
      await refreshDashboard();
      showToast(`Saved last location for ${driver.display_name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to update last location: ${message}`);
    }
  };

  const seedDriverCardDraft = (
    driver: DriverDashboardItem,
    todayShift?: DriverShiftRecord
  ): DriverCardDraft => ({
    displayName: driver.display_name ?? "",
    status: driver.availability_status ?? "AVAILABLE",
    shiftStart: isoToTimeInput(todayShift?.shift_start, ""),
    shiftEnd: isoToTimeInput(todayShift?.shift_end, ""),
    lunchStart: isoToTimeInput(todayShift?.lunch_start, ""),
    lunchEnd: isoToTimeInput(todayShift?.lunch_end, ""),
    truckNumber: driver.current_truck?.truck_number ?? "",
  });

  const handleDriverEditStart = (driver: DriverDashboardItem, todayShift?: DriverShiftRecord) => {
    setDriverEditMode((prev) => ({ ...prev, [driver.driver_id]: true }));
    setDriverEditDrafts((prev) => ({
      ...prev,
      [driver.driver_id]: seedDriverCardDraft(driver, todayShift),
    }));
  };

  const handleDriverEditCancel = (driverId: string) => {
    setDriverEditMode((prev) => ({ ...prev, [driverId]: false }));
  };

  const handleDriverEditDraftChange = (
    driverId: string,
    key: keyof DriverCardDraft,
    value: string
  ) => {
    setDriverEditDrafts((prev) => {
      const current = prev[driverId];
      if (!current) return prev;
      return { ...prev, [driverId]: { ...current, [key]: value } };
    });
  };

  const handleDriverCardSave = async (
    driver: DriverDashboardItem,
    todayShift?: DriverShiftRecord
  ) => {
    if (!isTauri) return;
    const draft = driverEditDrafts[driver.driver_id];
    if (!draft) return;

    const displayName = draft.displayName.trim();
    const currentTruck = driver.current_truck?.truck_number ?? "";
    const nextTruck = draft.truckNumber.trim();
    const updatePayload: {
      display_name?: string;
      availability_status?: string;
    } = {};

    if (displayName && displayName !== driver.display_name) {
      updatePayload.display_name = displayName;
    }
    if (draft.status && draft.status !== driver.availability_status) {
      updatePayload.availability_status = draft.status;
    }

    try {
      if (Object.keys(updatePayload).length > 0) {
        await invoke("driver_update", {
          driverId: driver.driver_id,
          payload: updatePayload,
        });
      }

      if (nextTruck !== currentTruck) {
        await invoke("driver_truck_assign", {
          driverId: driver.driver_id,
          truckNumber: nextTruck.length === 0 ? null : nextTruck,
        });
      }

      if (todayShift) {
        const baseDate = new Date(todayShift.shift_start);
        const shiftStart = timeInputToIso(
          baseDate,
          draft.shiftStart || isoToTimeInput(todayShift.shift_start)
        );
        const shiftEnd = timeInputToIso(
          baseDate,
          draft.shiftEnd || isoToTimeInput(todayShift.shift_end)
        );
        const lunchStart = timeInputToIso(
          baseDate,
          draft.lunchStart || isoToTimeInput(todayShift.lunch_start)
        );
        const lunchEnd = timeInputToIso(
          baseDate,
          draft.lunchEnd || isoToTimeInput(todayShift.lunch_end)
        );
        await invoke("shift_update", {
          shiftId: todayShift.id,
          payload: {
            shiftStart,
            shiftEnd,
            lunchStart,
            lunchEnd,
            shiftLabel: todayShift.shift_label ?? null,
          },
        });
      }

      setDriverEditMode((prev) => ({ ...prev, [driver.driver_id]: false }));
      await refreshSchedule();
      await refreshDashboard();
      await refreshDriverReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to update driver: ${message}`);
    }
  };

  const handleStatusClick = async (
    callId: string,
    status: CallStatus,
    driverId?: string
  ) => {
    if (!isTauri) return;
    if (status === "98") {
      if (!isChecklistComplete(callId)) {
        setClearErrors((prev) => ({
          ...prev,
          [callId]: "Checklist incomplete. You can set 98, but cannot complete until finished.",
        }));
      }
    }
    try {
      await invoke("call_status_set", { callId, status });
      if (driverId) {
        const availability = status === "98" ? "AVAILABLE" : "BUSY";
        await invoke("driver_update", {
          driverId,
          payload: { availability_status: availability },
        });
      }
      await refreshDashboard();
      await refreshDriverReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to update call status: ${message}`);
    }
  };

  const handlePromoteCall = async (callId: string, driverId: string) => {
    if (!isTauri) return;
    const driver = dashboardDrivers.find((item) => item.driver_id === driverId);
    const activeCallId = driver?.active_call?.call_id;
    if (activeCallId) {
      if (!isChecklistComplete(activeCallId)) {
        setClearErrors((prev) => ({
          ...prev,
          [activeCallId]: "Complete the checklist before activating another call.",
        }));
        alert("Complete the checklist before activating another call.");
        return;
      }
      if (!isNsrChecklistComplete(activeCallId)) {
        setNsrErrors((prev) => ({
          ...prev,
          [activeCallId]: "Complete the NSR checklist before activating another call.",
        }));
        alert("Complete the NSR checklist before activating another call.");
        return;
      }
    }
    await invoke("call_activate", { callId, driverId });
    await refreshDashboard();
  };

  const mapOwnerForInvoke = (
    owner: { type: "driver"; driverId: string } | { type: "unassigned" }
  ) => {
    if (owner.type === "driver") {
      return { type: "driver", driver_id: owner.driverId };
    }
    return { type: "unassigned" as const };
  };

  const handleQueueMove = async (
    callId: string,
    fromOwner: { type: "driver"; driverId: string } | { type: "unassigned" },
    toOwner: { type: "driver"; driverId: string } | { type: "unassigned" },
    newPosition: number
  ) => {
    if (!isTauri) return;
    try {
      await invoke("queue_move", {
        callId,
        fromOwner: mapOwnerForInvoke(fromOwner),
        toOwner: mapOwnerForInvoke(toOwner),
        newPosition,
      });
      await refreshDashboard();
      await refreshDriverReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("queue_move failed", message);
      alert(`Failed to assign driver: ${message}`);
    }
  };

  const handleActiveReassign = async (
    callId: string,
    fromDriverId: string,
    toDriverId: string | null
  ) => {
    if (!isTauri) return;
    try {
      await invoke("call_active_reassign", {
        callId,
        fromDriverId,
        toDriverId: toDriverId || null,
      });
      await refreshDashboard();
      await refreshDriverReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("call_active_reassign failed", message);
      alert(`Failed to reassign call: ${message}`);
    }
  };

  const readDragPayload = (event: React.DragEvent<HTMLElement>) => {
    if (dragPayload) return dragPayload;
    try {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return null;
      const raw = dataTransfer.getData("application/dispatcherone-call");
      if (!raw) return null;
      return JSON.parse(raw) as {
        callId: string;
        fromOwner: { type: "driver"; driverId: string } | { type: "unassigned" };
      };
    } catch {
      return null;
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    payload: { callId: string; fromOwner: { type: "driver"; driverId: string } | { type: "unassigned" } }
  ) => {
    setDragPayload(payload);
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;
    dataTransfer.effectAllowed = "move";
    dataTransfer.setData("application/dispatcherone-call", JSON.stringify(payload));
  };

  const handleDragEnd = () => {
    setDragPayload(null);
    setDragOverDriverId(null);
    setDragOverUnassigned(false);
    setDragOverCallId(null);
    setDragOverPlacement(null);
  };

  const handleDropToDriverQueue = async (
    event: React.DragEvent<HTMLElement>,
    driverId: string,
    position: number
  ) => {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (!payload) return;
    await handleQueueMove(
      payload.callId,
      payload.fromOwner,
      { type: "driver", driverId },
      position
    );
    setDragOverDriverId(null);
    setDragOverCallId(null);
    setDragPayload(null);
  };

  const handleDropToUnassigned = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (!payload) return;
    await handleQueueMove(payload.callId, payload.fromOwner, { type: "unassigned" }, 1);
    setDragOverCallId(null);
    setDragOverPlacement(null);
    setDragPayload(null);
  };

  const applyOcrPreview = (
    preview: OcrImportPreview,
    options?: {
      pickupAddress?: string | null;
      dropoffAddress?: string | null;
      applyPickup?: boolean;
      applyDropoff?: boolean;
    }
  ) => {
    const applyPickup = options?.applyPickup ?? true;
    const applyDropoff = options?.applyDropoff ?? true;
    const pickupAddress = applyPickup ? (options?.pickupAddress ?? preview.pickup_address) : null;
    const dropoffAddress = applyDropoff ? (options?.dropoffAddress ?? preview.dropoff_address) : null;
    setCallDraft((prev) => ({
      ...prev,
      callNumber: preview.call_number || prev.callNumber,
      workType: preview.work_type_id || prev.workType,
      vehicleType: preview.vehicle_name ? preview.vehicle_name.replace(/\s+\b[A-Z]{1,2}\b\s*$/, "") : prev.vehicleType,
      coverage: preview.membership_level || prev.coverage,
      pickupLocation: pickupAddress ? pickupAddress.trim() : prev.pickupLocation,
      dropoffLocation: dropoffAddress ? dropoffAddress.trim() : prev.dropoffLocation,
      pta: preview.pta || prev.pta,
      contactId: preview.contact_id || prev.contactId,
      memberPhone: preview.phone_number || prev.memberPhone,
      inTowEta: preview.in_tow_eta || prev.inTowEta,
    }));
  };

  const confidenceLabel = (score: number) => {
    if (score >= 75) return "High";
    if (score >= 50) return "Medium";
    return "Low";
  };

  const markPickupValidation = (status: AddressValidation["status"], input: string, result?: GeocodeValidationResult | null) => {
    setPickupValidation({ status, input, result: result ?? null });
  };

  const markDropoffValidation = (status: AddressValidation["status"], input: string, result?: GeocodeValidationResult | null) => {
    setDropoffValidation({ status, input, result: result ?? null });
  };

  const openOcrConfirm = (preview: OcrImportPreview, templateType: "ACE_PICKUP" | "ACE_DROPOFF") => {
    const address = templateType === "ACE_PICKUP" ? preview.pickup_address : preview.dropoff_address;
    if (!address) {
      applyOcrPreview(preview);
      return;
    }
    const applyOptions =
      templateType === "ACE_PICKUP" ? { applyPickup: false } : { applyDropoff: false };
    applyOcrPreview(preview, applyOptions);
    setOcrConfirm({
      preview,
      templateType,
      addressText: address,
      validation: null,
      validationError: null,
      validating: false,
    });
  };

  const handleOcrValidate = async () => {
    if (!ocrConfirm) return;
    const text = ocrConfirm.addressText.trim();
    if (!text) {
      setOcrConfirm({ ...ocrConfirm, validationError: "Address is required." });
      return;
    }
    setOcrConfirm({ ...ocrConfirm, validating: true, validationError: null });
    try {
      const result = (await invoke("google_geocode_validate", { address: text })) as GeocodeValidationResult;
      setOcrConfirm({ ...ocrConfirm, validating: false, validation: result, validationError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOcrConfirm({ ...ocrConfirm, validating: false, validationError: message });
    }
  };

  const applyOcrAddressAsIs = (text: string) => {
    if (!ocrConfirm) return;
    const isPickup = ocrConfirm.templateType === "ACE_PICKUP";
    const next = text.trim();
    if (isPickup) {
      setCallDraft((prev) => ({ ...prev, pickupLocation: next }));
      markPickupValidation("as_is", next, null);
    } else {
      setCallDraft((prev) => ({ ...prev, dropoffLocation: next }));
      markDropoffValidation("as_is", next, null);
    }
    setOcrConfirm(null);
  };

  const applyOcrAddressValidated = (result: GeocodeValidationResult) => {
    if (!ocrConfirm) return;
    const isPickup = ocrConfirm.templateType === "ACE_PICKUP";
    const next = result.formatted_address;
    if (isPickup) {
      setCallDraft((prev) => ({ ...prev, pickupLocation: next }));
      markPickupValidation("validated", next, result);
    } else {
      setCallDraft((prev) => ({ ...prev, dropoffLocation: next }));
      markDropoffValidation("validated", next, result);
    }
    setOcrConfirm(null);
  };

  const hasParsedOcrFields = (preview: OcrImportPreview) =>
    Boolean(
      preview.call_number ||
        preview.work_type_id ||
        preview.vehicle_name ||
        preview.membership_level ||
        preview.pickup_address ||
        preview.dropoff_address ||
        preview.pta ||
        preview.contact_id ||
        preview.phone_number ||
        preview.in_tow_eta
    );

  const coveredMiles = useMemo(() => {
    const raw = callDraft.coverage || "";
    const match = raw.match(/(\d+)\s*miles?/i);
    if (match) return Number(match[1]);
    if (/rv/i.test(raw)) return null;
    if (/classic/i.test(raw)) return 7;
    if (/plus/i.test(raw)) return 100;
    if (/premier/i.test(raw)) return 200;
    return null;
  }, [callDraft.coverage]);

  const isRvCoverage = useMemo(() => {
    const raw = callDraft.coverage || "";
    return normalizeMembership(raw) === "rv";
  }, [callDraft.coverage]);

  const overMiles = useMemo(() => {
    if (towMiles == null) return null;
    if (isRvCoverage) return Math.max(0, towMiles);
    if (coveredMiles == null) return null;
    return Math.max(0, towMiles - coveredMiles);
  }, [towMiles, coveredMiles, isRvCoverage]);

  const overMilesCost = useMemo(() => {
    if (overMiles == null) return null;
    return Math.round(overMiles * 12);
  }, [overMiles]);

  const overMilesChecklistComplete = useMemo(() => {
    if (overMiles == null || overMiles <= 0) return true;
    if (!overMilesChecklist.calledMember) return false;
    if (overMilesChecklist.decision === "AGREED") {
      return overMilesChecklist.paidCard || overMilesChecklist.paidCash;
    }
    if (overMilesChecklist.decision === "REFUSED") {
      return overMilesChecklist.updateAaa && overMilesChecklist.nsrClear;
    }
    return false;
  }, [overMiles, overMilesChecklist]);

  const handleOcrCapture = async (templateType: "ACE_PICKUP" | "ACE_DROPOFF") => {
    if (!isTauri) {
      alert("OCR upload is only available in the Tauri app.");
      return;
    }
    const requestId = ++ocrCaptureRequestSeqRef.current;
    activeOcrCaptureRequestRef.current = requestId;
    setOcrNotice(null);
    setOcrLoading(templateType === "ACE_PICKUP" ? "pickup" : "dropoff");
    try {
      const preview = (await invoke("ocr_capture_screenshot", {
        templateType,
      })) as OcrImportPreview;
      if (canceledOcrCaptureRequestsRef.current.has(requestId)) {
        canceledOcrCaptureRequestsRef.current.delete(requestId);
        return;
      }
      setOcrPreview(preview);
      setOcrImportIds((prev) => ({
        ...prev,
        [templateType === "ACE_PICKUP" ? "pickup" : "dropoff"]: preview.import_id,
      }));
      setOcrLastTemplate(templateType);
      if (!hasParsedOcrFields(preview)) {
        setOcrNotice("OCR finished, but no fields were detected. Open the OCR text below.");
      }
      openOcrConfirm(preview, templateType);
    } catch (error) {
      if (canceledOcrCaptureRequestsRef.current.has(requestId)) {
        canceledOcrCaptureRequestsRef.current.delete(requestId);
        return;
      }
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      if (activeOcrCaptureRequestRef.current === requestId) {
        activeOcrCaptureRequestRef.current = null;
        setOcrLoading(null);
      }
    }
  };

  const mapCallType = (callType: string, lawAgency: string) => {
    switch (callType) {
      case "AAA":
        return { sourceType: "AAA", pricingCategory: "AAA", lawAgency: null };
      case "LAW_ENFORCEMENT":
        return { sourceType: "LAW_ENFORCEMENT", pricingCategory: "LAW_ENFORCEMENT", lawAgency };
      case "PPI":
        return { sourceType: "PPI", pricingCategory: "PPI", lawAgency: null };
      case "COD":
        return { sourceType: "COD", pricingCategory: "COD", lawAgency: null };
      default:
        return { sourceType: "AAA", pricingCategory: "AAA", lawAgency: null };
    }
  };

  const handleAvailabilityChange = async (driverId: string, status: string) => {
    if (!isTauri) return;
    try {
      const current = dashboardDrivers.find((item) => item.driver_id === driverId);
      const wasOnLunch = current?.availability_status === "ON_LUNCH";
      if (wasOnLunch && status === "AVAILABLE") {
        setPauseLunchAt((prev) => ({ ...prev, [driverId]: new Date().toISOString() }));
      }
      if (status === "ON_LUNCH") {
        setPauseLunchAt((prev) => {
          const next = { ...prev };
          delete next[driverId];
          return next;
        });
        setLunchStartAt((prev) => ({ ...prev, [driverId]: new Date().toISOString() }));
      }
      await invoke("driver_update", {
        driverId,
        payload: { availability_status: status },
      });
      await refreshDashboard();
      await refreshDriverReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to update driver status: ${message}`);
    }
  };

  const findDashboardCall = useCallback(
    (callId: string) => {
      for (const driver of dashboardDrivers) {
        if (driver.active_call?.call_id === callId) {
          return { call: driver.active_call, driver };
        }
        const queued = driver.pending_queue.find((item) => item.call_id === callId);
        if (queued) {
          return { call: queued, driver };
        }
      }
      const unassigned = dashboardUnassigned.find((item) => item.call_id === callId);
      if (unassigned) {
        return { call: unassigned, driver: null };
      }
      return null;
    },
    [dashboardDrivers, dashboardUnassigned]
  );

  const openFloatingDetail = useCallback(
    async (event: React.MouseEvent<HTMLElement>, callId: string, driverId?: string | null) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const width = 520;
      const height = 560;
      const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16));
      const top = Math.max(16, Math.min(rect.bottom + 10, window.innerHeight - height - 16));
      setFloatingDetail({
        callId,
        anchor: { top, left },
        driverId: driverId ?? null,
      });
      setFloatingDetailLoading(true);
      setFloatingDetailError(null);
      if (!isTauri) {
        setFloatingDetailLoading(false);
        setFloatingDetailError("Call details require the desktop app.");
        return;
      }
      try {
        const detail = (await invoke("call_get", { callId })) as CallDetail;
        setFloatingDetailCall(detail);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setFloatingDetailError(message);
      } finally {
        setFloatingDetailLoading(false);
      }
    },
    [isTauri]
  );

  const handleAddCallSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isTauri) return;
    setAddCallError("");
    try {
      if (!callDraft.callType) {
        setAddCallError("Select a source type to continue.");
        return;
      }

      const requiresPickup =
        callDraft.callType === "AAA";
      const requiresLocation =
        callDraft.callType === "LAW_ENFORCEMENT" ||
        callDraft.callType === "COD" ||
        callDraft.callType === "PPI";

    if (requiresPickup && !callDraft.pickupLocation.trim()) {
      setAddCallError("Pickup address is required.");
      return;
    }
    if (requiresLocation && !callDraft.pickupLocation.trim()) {
      setAddCallError("Location is required.");
      return;
    }
    if (overMiles != null && overMiles > 0 && !overMilesChecklistComplete) {
      setAddCallError("Complete the over miles checklist before saving.");
      return;
    }

      const mapping = mapCallType(callDraft.callType, callDraft.lawAgency);
      const pickupNotes = [
        callDraft.workType ? `Work Type: ${callDraft.workType}` : null,
        callDraft.contactId ? `Contact ID: ${callDraft.contactId}` : null,
        callDraft.serviceType ? `Service Type: ${callDraft.serviceType}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      let pricingTotal: number | null = null;
      let pricingNotes: string | null = null;
      if ((callDraft.callType === "COD" || callDraft.callType === "PPI") && callDraft.serviceCharge) {
        const value = Number(callDraft.serviceCharge);
        pricingTotal = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
        pricingNotes = callDraft.serviceCharge ? `Service Charge: ${callDraft.serviceCharge}` : null;
      }

    const extraNotes: string[] = [];
    if (callDraft.workType.trim()) {
      extraNotes.push(`Work Type ID: ${callDraft.workType.trim()}`);
    }
    if (callDraft.vehicleType.trim()) {
      extraNotes.push(`Car Type: ${callDraft.vehicleType.trim()}`);
    }
    if (callDraft.callType === "LAW_ENFORCEMENT") {
      if (callDraft.leTimestamp) {
        extraNotes.push(`LE Timestamp: ${callDraft.leTimestamp}`);
      }
    }
    if ((callDraft.callType === "COD" || callDraft.callType === "PPI") && callDraft.serviceType) {
      extraNotes.push(`Service Type: ${callDraft.serviceType}`);
    }
    if (callDraft.callType === "COD" && towMiles != null) {
      extraNotes.push(`Tow Miles: ${towMiles.toFixed(1)}`);
    }
    if ((callDraft.callType === "AAA") && callDraft.inTowEta) {
      extraNotes.push(`In Tow ETA: ${callDraft.inTowEta}`);
    }
    if (overMiles != null && overMiles > 0) {
      extraNotes.push(`Over Miles: ${overMiles.toFixed(1)}`);
      if (overMilesCost != null) {
        extraNotes.push(`Over Mile Cost: $${overMilesCost.toFixed(2)}`);
      }
    }

      const payload = {
        external_call_number: callDraft.callNumber || null,
        source_type: mapping.sourceType,
        law_agency: mapping.lawAgency,
        pickup_address: callDraft.pickupLocation,
        dropoff_address: callDraft.dropoffLocation || null,
        pickup_notes: pickupNotes || null,
        contact_id: callDraft.contactId || null,
        contact_name: callDraft.memberName || null,
        callback_phone: callDraft.memberPhone || null,
        vehicle_description: callDraft.vehicleType || null,
        membership_level: callDraft.coverage || null,
        status: "PENDING",
        created_via: ocrImportIds.pickup || ocrImportIds.dropoff ? "OCR" : "MANUAL",
        pricing_category: mapping.pricingCategory,
        pricing_total: pricingTotal,
        pricing_notes: pricingNotes,
        notes: [callDraft.notes, ...extraNotes].filter(Boolean).join(" | ") || null,
      };

      let callId: string;
      if (ocrImportIds.pickup || ocrImportIds.dropoff) {
        const importId = ocrImportIds.pickup ?? ocrImportIds.dropoff ?? "";
        callId = (await invoke("ocr_create_call", {
          importId,
          payload,
        })) as string;
        const extraImportId = ocrImportIds.pickup && ocrImportIds.dropoff ? ocrImportIds.dropoff : null;
        if (extraImportId && extraImportId !== importId) {
          await invoke("ocr_attach_call", {
            importId: extraImportId,
            callId,
          });
        }
      } else {
        callId = (await invoke("call_create", { payload })) as string;
      }

      if (callDraft.assignedDriverId) {
      await invoke("queue_add", {
        callId,
        driverId: callDraft.assignedDriverId,
        position: null,
      });
      }

      if (callDraft.pickupLocation.trim() && callDraft.dropoffLocation.trim()) {
        try {
          const miles = (await invoke("call_tow_distance", {
            pickupAddress: callDraft.pickupLocation.trim(),
            dropoffAddress: callDraft.dropoffLocation.trim(),
          })) as number;
          setCallTowMiles((prev) => ({ ...prev, [callId]: Number(miles) }));
        } catch {
          // ignore tow miles errors on save
        }
      }

      await refreshDashboard();
      setCallDraft(emptyCallDraft);
      setPickupValidation({ status: "unvalidated", input: "", result: null });
      setDropoffValidation({ status: "unvalidated", input: "", result: null });
      setTowMiles(null);
      setTowMilesError(null);
      setOcrImportIds({});
      setOcrPreview(null);
      setOcrNotice(null);
      if (isDrawerWindow) {
        await closeDrawerWindow();
      } else {
        setIsAddCallOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAddCallError(`Failed to save call: ${message}`);
    }
  };

  const handleCancelCalls = async (callIds: string[]) => {
    if (!isTauri || callIds.length === 0) return;
    for (const callId of callIds) {
      await invoke("call_cancel", { callId });
    }
    await refreshDashboard();
    await refreshDriverReport();
  };

  const getDriverDisplayStatus = (driver: DriverDashboardItem) =>
    driver.active_call ? "BUSY" : driver.availability_status;

  const sortedDrivers = useMemo(() => {
    const order: Record<string, number> = { AVAILABLE: 0, BUSY: 1, ON_LUNCH: 2 };
    return dashboardDrivers
      .filter((driver) => getDriverDisplayStatus(driver) !== "OFF_SHIFT")
      .sort((a, b) => {
      const aStatus = getDriverDisplayStatus(a);
      const bStatus = getDriverDisplayStatus(b);
      const rankA = order[aStatus] ?? 99;
      const rankB = order[bStatus] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [dashboardDrivers]);

  const handleCompleteCall = async (callId: string, driverId?: string) => {
    console.log("handleCompleteCall invoked for callId:", callId);
    if (!isTauri) {
      console.log("Not in Tauri environment, returning.");
      showToast("Complete is only available in the desktop app.");
      return;
    }
    setCompleteLoading((prev) => ({ ...prev, [callId]: true }));
    const active = findDashboardCall(callId);
    console.log("Active call status:", active?.call?.status);
    const status = active?.call?.status;
    if (status !== "95" && status !== "98") {
      setClearErrors((prev) => ({
        ...prev,
        [callId]: "Call status must be 95 or 98 to complete.", // Added specific error message
      }));
      setCompleteLoading((prev) => ({ ...prev, [callId]: false }));
      console.log("Call status is not 95 or 98, returning.");
      showToast("Call status must be 95 or 98 before completing.");
      return;
    }
    const checklistComplete =
      status === "95" ? isNsrChecklistComplete(callId) : isChecklistComplete(callId);
    console.log("Is checklist complete?", checklistComplete);
    if (!checklistComplete) {
      if (status === "95") {
        setNsrErrors((prev) => ({
          ...prev,
          [callId]: "Complete the NSR checklist before completing the call.",
        }));
      } else {
        setClearErrors((prev) => ({
          ...prev,
          [callId]: "Complete the checklist before clearing the call.",
        }));
      }
      setCompleteLoading((prev) => ({ ...prev, [callId]: false }));
      console.log("Checklist incomplete, returning.");
      showToast(
        status === "95"
          ? "Complete the NSR checklist before completing the call."
          : "Complete the checklist before completing the call."
      );
      return;
    }
    try {
      const driverForStatus =
        driverId ? dashboardDrivers.find((item) => item.driver_id === driverId) : undefined;
      const nextAvailability =
        driverForStatus && driverForStatus.pending_queue.length > 0 ? "BUSY" : "AVAILABLE";
      await invoke("call_complete", { callId });
      if (driverId) {
        await invoke("driver_update", {
          driverId,
          payload: { availability_status: nextAvailability },
        });
      }
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drivers: prev.drivers.map((driver) => {
            if (driver.active_call?.call_id !== callId) return driver;
            return {
              ...driver,
              availability_status: nextAvailability,
              active_call: null,
            };
          }),
        };
      });
      await refreshDashboard();
      await refreshDriverReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`Complete failed: ${message}`);
    } finally {
      setCompleteLoading((prev) => ({ ...prev, [callId]: false }));
    }
  };

  const animateWindowX = async (
    win: WebviewWindow,
    fromX: number,
    toX: number,
    y: number,
    durationMs = 240
  ) => {
    const start = performance.now();
    return new Promise<void>((resolve) => {
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        const nextX = Math.round(fromX + (toX - fromX) * eased);
        void win.setPosition(new LogicalPosition(nextX, y));
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  };

  const closeDrawerWindow = async () => {
    try {
      if (isDrawerWindow) {
        await closeCurrentNonMainWindow();
        return;
      }
      await emit("drawer-closed");
      let drawer: WebviewWindow | null = null;
      try {
        drawer = await WebviewWindow.getByLabel(DRAWER_LABEL);
      } catch {
        drawer = null;
      }
      if (drawer) {
        const pos = await drawer.outerPosition();
        const drawerSize = await drawer.outerSize();
        const panelSideSetting = localStorage.getItem(PANEL_SIDE_KEY);
        const side = panelSideSetting === "left" || panelSideSetting === "right" ? panelSideSetting : "right";
        const drawerWidth = drawerSize.width;
        const targetX = side === "right" ? pos.x - drawerWidth : pos.x + drawerWidth;
        await animateWindowX(drawer, pos.x, targetX, pos.y);
        await drawer.close();
        drawerModeRef.current = null;
      }
    } catch {
      // Ignore window errors when not running in Tauri.
    }
  };

  const handleCloseAddCall = async () => {
    if (isDrawerWindow) {
      await closeDrawerWindow();
    } else {
      setIsAddCallOpen(false);
    }
  };

  const openAddCallDrawer = () => {
    setCallDraft(emptyCallDraft);
    setIsAddCallOpen(true);
    setOverMilesChecklist({
      calledMember: false,
      decision: "",
      paidCard: false,
      paidCash: false,
      updateAaa: false,
      nsrClear: false,
    });
  };

  const openDrawerWindow = async (
    mode: "new-call" | "call-detail" | "weekly-schedule",
    callId?: string,
    edit?: boolean
  ) => {
    if (!isTauri) {
      if (mode === "new-call") {
        openAddCallDrawer();
      } else if (callId) {
        setIsAddCallOpen(false);
      }
      return;
    }
    if (mode === "new-call") {
      openAddCallDrawer();
      return;
    }
    drawerModeRef.current = mode === "weekly-schedule" ? "weekly-schedule" : "call-detail";
    try {
      let drawer: WebviewWindow | null = null;
      try {
        drawer = await WebviewWindow.getByLabel(DRAWER_LABEL);
      } catch {
        drawer = null;
      }
      if (mode === "weekly-schedule" && drawer) {
        try {
          await drawer.close();
        } catch {
          // ignore
        }
        drawer = null;
      }
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      let drawerHeight = size.height;
      let drawerWidth = mode === "weekly-schedule" ? WEEKLY_SCHEDULE_DRAWER_WIDTH : WINDOW_WIDTH;
      let monitorMinX: number | null = null;
      let monitorMaxX: number | null = null;
      let monitorMinY: number | null = null;
      let monitorMaxY: number | null = null;
      try {
        const monitor = (await monitorFromPoint(pos.x, pos.y)) ?? (await primaryMonitor());
        if (monitor) {
          const maxDrawerWidth =
            mode === "weekly-schedule"
              ? Math.max(560, monitor.size.width - 4)
              : Math.max(560, monitor.size.width - DRAWER_SCREEN_MARGIN * 2);
          drawerWidth = Math.min(drawerWidth, maxDrawerWidth);
          if (mode === "weekly-schedule") {
            drawerHeight = Math.min(
              WEEKLY_SCHEDULE_ADJUSTED_HEIGHT,
              Math.max(460, monitor.size.height - DRAWER_SCREEN_MARGIN * 2)
            );
          }
          monitorMinX = monitor.position.x;
          monitorMaxX = monitor.position.x + monitor.size.width - drawerWidth;
          monitorMinY = monitor.position.y;
          monitorMaxY = monitor.position.y + monitor.size.height - drawerHeight;
        }
      } catch {
        // fallback to default width
      }
      const url = `${window.location.origin}?drawer=${mode}${
        callId ? `&callId=${encodeURIComponent(callId)}` : ""
      }${edit ? "&edit=1" : ""}`;
      const title = mode === "weekly-schedule" ? "Weekly Schedule" : "Call Details";
      const rawTargetX =
        mode === "weekly-schedule"
          ? pos.x + size.width - WEEKLY_SCHEDULE_BASE_WIDTH
          : panelSide === "right"
            ? pos.x - drawerWidth
            : pos.x + size.width;
      const rawTargetY = mode === "weekly-schedule" ? pos.y + WEEKLY_SCHEDULE_Y_OFFSET : pos.y;
      const targetX =
        monitorMinX != null && monitorMaxX != null
          ? Math.max(monitorMinX, Math.min(monitorMaxX, rawTargetX))
          : rawTargetX;
      const targetY =
        monitorMinY != null && monitorMaxY != null
          ? Math.max(monitorMinY, Math.min(monitorMaxY, rawTargetY))
          : rawTargetY;
      const slideOffset = mode === "weekly-schedule" ? 0 : drawerWidth;
      const startX = panelSide === "right" ? targetX - slideOffset : targetX + slideOffset;
      if (drawer) {
        try {
          const maybeNavigate = (drawer as any).navigate;
          if (typeof maybeNavigate === "function") {
            await maybeNavigate.call(drawer, url);
          } else {
            await drawer.emit("tauri://navigate", { url });
          }
          await drawer.setSize(new LogicalSize(drawerWidth, drawerHeight));
          if (mode === "weekly-schedule") {
            await setWindowSizeConstraintsSafe(drawer, {
              minWidth: Math.max(560, drawerWidth - 220),
              minHeight: 400,
            });
          } else {
            await setWindowSizeConstraintsSafe(drawer, {
              minWidth: drawerWidth,
              maxWidth: drawerWidth,
              minHeight: 400,
              maxHeight: drawerHeight,
            });
          }
          await animateWindowX(drawer, startX, targetX, targetY);
          setIsAddCallOpen(false);
          return;
        } catch {
          // If a stale drawer instance cannot navigate, close it before recreating by label.
          try {
            await drawer.close();
          } catch {
            // ignore
          }
          drawer = null;
        }
      }
      const newDrawer = new WebviewWindow(DRAWER_LABEL, {
        url,
        title,
        x: startX,
        y: targetY,
        width: drawerWidth,
        height: drawerHeight,
        minWidth: mode === "weekly-schedule" ? Math.max(560, drawerWidth - 220) : drawerWidth,
        maxWidth: mode === "weekly-schedule" ? undefined : drawerWidth,
        minHeight: 400,
        maxHeight: mode === "weekly-schedule" ? undefined : drawerHeight,
        resizable: true,
        decorations: mode === "weekly-schedule" ? true : false,
        alwaysOnTop,
        visible: true,
      });
      newDrawer.once("tauri://error", (event) => {
        console.error("Drawer window error", event);
        alert("Failed to open the drawer window.");
      });
      newDrawer.once("tauri://created", async () => {
        if (mode === "weekly-schedule") {
          await setWindowSizeConstraintsSafe(newDrawer, {
            minWidth: Math.max(560, drawerWidth - 220),
            minHeight: 400,
          });
        } else {
          await setWindowSizeConstraintsSafe(newDrawer, {
            minWidth: drawerWidth,
            maxWidth: drawerWidth,
            minHeight: 400,
            maxHeight: drawerHeight,
          });
        }
        await animateWindowX(newDrawer, startX, targetX, targetY);
        await newDrawer.show();
        await newDrawer.setFocus();
        setIsAddCallOpen(false);
      });
      if (callId) {
        setIsAddCallOpen(false);
      }
    } catch (err) {
      console.error("Failed to open drawer window", err);
      alert("Failed to open the drawer window.");
    }
  };

  const renderFloatingDetail = () => {
    if (!floatingDetail) return null;
    const { callId, anchor, driverId } = floatingDetail;
    const lookup = findDashboardCall(callId);
    const fallbackCall = lookup?.call ?? null;
    const detailCall = floatingDetailCall?.call ?? null;
    const call = detailCall ?? fallbackCall;
    const driver =
      driverId ? dashboardDrivers.find((item) => item.driver_id === driverId) ?? null : lookup?.driver ?? null;
    return (
      <div
        className="floating-detail-backdrop"
        onClick={() => {
          closeFloatingDetail();
        }}
      >
        <div
          className="floating-detail-card"
          style={{ top: anchor.top, left: anchor.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="call-detail-header">
            <h3>Call Details</h3>
            <div className="call-detail-actions">
              <button className="ghost-button" onClick={closeFloatingDetail}>
                Close
              </button>
            </div>
          </header>
          {floatingDetailLoading ? (
            <div className="driver-empty">Loading call…</div>
          ) : floatingDetailError ? (
            <div className="driver-empty">{floatingDetailError}</div>
          ) : !call ? (
            <div className="driver-empty">Call not found.</div>
          ) : (
            <>
              <div className="detail-grid-rows">
                <div className="detail-row">
                  <span>Driver Name</span>
                  <span>{driver?.display_name ?? "Unassigned"}</span>
                </div>
                <div className="detail-row detail-row-right">
                  <span>Truck #</span>
                  <span>{driver?.current_truck?.truck_number ?? "--"}</span>
                </div>
                <div className="detail-row">
                  <span>Shift</span>
                  <span>{formatIsoTime(driver?.today_shift_start)}</span>
                </div>
                <div className="detail-row detail-row-right">
                  <span>Lunch</span>
                  <span>--</span>
                </div>
              </div>

              <div className="detail-section-header">
                <span>Call Info</span>
              </div>

              <div className="detail-grid-rows">
                <div className="detail-row">
                  <span>Call #</span>
                  <span>{call.external_call_number ?? "--"}</span>
                </div>
                <div className="detail-row detail-row-right">
                  <span>Source</span>
                  <span>
                    {call.source_type}
                    {call.law_agency ? ` · ${call.law_agency}` : ""}
                  </span>
                </div>
                <div className="detail-row">
                  <span>Status</span>
                  <span>{call.status}</span>
                </div>
                <div className="detail-row detail-row-right">
                  <span>Updated</span>
                  <span>{formatIsoTime(call.status_updated_at)}</span>
                </div>
                <div className="detail-row detail-row-wide">
                  <span>Pickup</span>
                  <span>{call.pickup_address}</span>
                </div>
                {call.dropoff_address ? (
                  <div className="detail-row detail-row-wide">
                    <span>Drop-off</span>
                    <span>{call.dropoff_address}</span>
                  </div>
                ) : null}
                <div className="detail-row">
                  <span>Contact ID</span>
                  <span>{call.contact_id ?? "--"}</span>
                </div>
                <div className="detail-row detail-row-right">
                  <span>Phone</span>
                  <span>{call.callback_phone ?? "--"}</span>
                </div>
                <div className="detail-row">
                  <span>Vehicle</span>
                  <span>{call.vehicle_description ?? "--"}</span>
                </div>
                <div className="detail-row detail-row-right">
                  <span>Membership</span>
                  <span>{call.membership_level ?? "--"}</span>
                </div>
                <div className="detail-row">
                  <span>Pricing</span>
                  <span>{call.pricing_total ?? "--"}</span>
                </div>
                {call.source_type === "COD" || call.source_type === "PPI" ? (
                  <>
                    <div className="detail-row">
                      <span>Payment Type</span>
                      <span>{extractNoteValue(call.notes, "Payment Type") ?? "--"}</span>
                    </div>
                    <div className="detail-row detail-row-right">
                      <span>Amount Paid</span>
                      <span>{extractNoteValue(call.notes, "Amount Paid") ?? "--"}</span>
                    </div>
                  </>
                ) : null}
                <div className="detail-row detail-row-right">
                  <span>Created</span>
                  <span>{formatIsoTime(call.created_at)}</span>
                </div>
                {call.pricing_notes ? (
                  <div className="detail-row detail-row-wide">
                    <span>Pricing notes</span>
                    <span>{call.pricing_notes}</span>
                  </div>
                ) : null}
                {call.notes ? (
                  <div className="detail-row detail-row-wide">
                    <span>Notes</span>
                    <span>{call.notes}</span>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const positionDrawerWindow = async () => {
    try {
      const drawer = await WebviewWindow.getByLabel(DRAWER_LABEL);
      if (!drawer) return;
      if (drawerModeRef.current === "weekly-schedule") return;
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      let drawerWidth = WINDOW_WIDTH;
      let drawerHeight = size.height;
      let drawerX = panelSide === "right" ? pos.x - drawerWidth : pos.x + size.width;
      let drawerY = pos.y;
      const drawerSize = await drawer.outerSize();
      drawerWidth = drawerSize.width;
      drawerHeight = size.height;
      drawerX = panelSide === "right" ? pos.x - drawerWidth : pos.x + size.width;
      drawerY = pos.y;
      await drawer.setPosition(new LogicalPosition(drawerX, drawerY));
      await drawer.setSize(new LogicalSize(drawerWidth, drawerHeight));
      await setWindowSizeConstraintsSafe(drawer, {
        minWidth: drawerWidth,
        maxWidth: drawerWidth,
        minHeight: 400,
        maxHeight: drawerHeight,
      });
    } catch {
      // Ignore window errors when not running in Tauri.
    }
  };


  let contentBody: JSX.Element;
  const renderAddCallFormFields = () => (
    <>
      <div className="add-call-source-row">
        <div className="add-call-source-label">Source Type</div>
        <div className="add-call-source-field">
          <select
            value={callDraft.callType}
            onChange={(event) => {
              const next = event.target.value;
              setCallDraft((prev) => ({
                ...prev,
                callType: next,
                lawAgency: next === "LAW_ENFORCEMENT" ? prev.lawAgency || "SDPD" : "",
              }));
            }}
          >
            <option value="">Select source type</option>
            <option value="LAW_ENFORCEMENT">Law Enforcement</option>
            <option value="COD">COD</option>
            <option value="PPI">PPI</option>
            <option value="AAA">AAA</option>
                      </select>
        </div>
      </div>
      {callDraft.callType === "LAW_ENFORCEMENT" ? (
        <div className="form-row">
          <label className="form-field">
            Agency
            <select
              value={callDraft.lawAgency}
              onChange={(event) =>
                setCallDraft((prev) => ({ ...prev, lawAgency: event.target.value }))
              }
            >
              <option value="SDPD">SDPD</option>
              <option value="CHP">CHP</option>
              <option value="CVPD">CVPD</option>
              <option value="SHERIFFS">Sheriffs</option>
              <option value="COD">COD</option>
            </select>
          </label>
        </div>
      ) : null}

      {callDraft.callType ? (
        <>
          {addCallError ? <div className="form-error">{addCallError}</div> : null}
          {(callDraft.callType === "AAA") && (
            <>
              <div className="add-call-layout">
                <div className="add-call-capture-note"><em>[capture to pick up info press Cntrl + Shift + 1]</em></div>
                <label className="form-field">
                  Pick up
                  <input
                    type="text"
                    ref={pickupInputRef}
                    value={callDraft.pickupLocation}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCallDraft((prev) => ({ ...prev, pickupLocation: value }));
                      markPickupValidation("unvalidated", value, null);
                      setTowMiles(null);
                      setTowMilesError(null);
                    }}
                  />
                </label>
                <div className="add-call-actions-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      const text = callDraft.pickupLocation.trim();
                      if (!text) {
                        showToast("Pickup address is required.");
                        return;
                      }
                      setOcrConfirm({
                        preview: ocrPreview ?? {
                          import_id: "",
                          template_type: "ACE_PICKUP",
                          raw_text: "",
                          pickup_address: text,
                          dropoff_address: null,
                          confidence: 0,
                        },
                        templateType: "ACE_PICKUP",
                        addressText: text,
                        validation: null,
                        validationError: null,
                        validating: false,
                      });
                    }}
                  >
                    Validate pickup
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      const text = callDraft.pickupLocation.trim();
                      if (!text) {
                        showToast("Pickup address is required.");
                        return;
                      }
                      markPickupValidation("as_is", text, null);
                      showToast("Pickup marked as confirmed (no validation).");
                    }}
                  >
                    Use pickup as is
                  </button>
                </div>
                <div className="add-call-divider" />

                <div className="add-call-capture-note"><em>[capture to drop off info press Cntrl + Shift + 2]</em></div>
                <label className="form-field">
                  Drop off
                  <input
                    type="text"
                    ref={dropoffInputRef}
                    value={callDraft.dropoffLocation}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCallDraft((prev) => ({ ...prev, dropoffLocation: value }));
                      markDropoffValidation("unvalidated", value, null);
                      setTowMiles(null);
                      setTowMilesError(null);
                    }}
                  />
                </label>
                <div className="add-call-actions-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      const text = callDraft.dropoffLocation.trim();
                      if (!text) {
                        showToast("Dropoff address is required.");
                        return;
                      }
                      setOcrConfirm({
                        preview: ocrPreview ?? {
                          import_id: "",
                          template_type: "ACE_DROPOFF",
                          raw_text: "",
                          pickup_address: null,
                          dropoff_address: text,
                          confidence: 0,
                        },
                        templateType: "ACE_DROPOFF",
                        addressText: text,
                        validation: null,
                        validationError: null,
                        validating: false,
                      });
                    }}
                  >
                    Validate dropoff
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      const text = callDraft.dropoffLocation.trim();
                      if (!text) {
                        showToast("Dropoff address is required.");
                        return;
                      }
                      markDropoffValidation("as_is", text, null);
                      showToast("Dropoff marked as confirmed (no validation).");
                    }}
                  >
                    Use dropoff as is
                  </button>
                </div>
                <div className="add-call-divider" />

                <div className="form-row">
                  <label className="form-field">
                    Call #
                    <input
                      type="text"
                      value={callDraft.callNumber}
                      onChange={(event) =>
                        setCallDraft((prev) => ({ ...prev, callNumber: event.target.value }))
                      }
                      placeholder="OCR"
                    />
                  </label>
                  <label className="form-field">
                    Work Type ID
                    <input
                      type="text"
                      value={callDraft.workType}
                      onChange={(event) =>
                        setCallDraft((prev) => ({ ...prev, workType: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <label className="form-field">
                  Car type
                  <input
                    type="text"
                    value={callDraft.vehicleType}
                    onChange={(event) =>
                      setCallDraft((prev) => ({ ...prev, vehicleType: event.target.value }))
                    }
                  />
                </label>

                <div className="form-row">
                  <label className="form-field">
                    Contact ID
                    <input
                      type="text"
                      value={callDraft.contactId}
                      onChange={(event) =>
                        setCallDraft((prev) => ({ ...prev, contactId: event.target.value }))
                      }
                    />
                  </label>
                  <label className="form-field">
                    PTA
                    <input
                      type="text"
                      value={callDraft.pta}
                      onChange={(event) =>
                        setCallDraft((prev) => ({ ...prev, pta: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Phone number
                    <input
                      type="text"
                      value={callDraft.memberPhone}
                      onChange={(event) =>
                        setCallDraft((prev) => ({
                          ...prev,
                          memberPhone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="form-field">
                    Membership level
                    <select
                      value={callDraft.coverage}
                      onChange={(event) =>
                        setCallDraft((prev) => ({ ...prev, coverage: event.target.value }))
                      }
                    >
                      <option value="">Select membership</option>
                      <option value="Classic (7 miles)">Classic (7 miles)</option>
                      <option value="Plus (100 miles)">Plus (100 miles)</option>
                      <option value="Premier (200 miles)">Premier (200 miles)</option>
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}
          {callDraft.callType === "LAW_ENFORCEMENT" ? (
            <div className="detail-grid-rows">
              <label className="form-field">
                Log #
                <input
                  type="text"
                  value={callDraft.callNumber}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, callNumber: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-right">
                Created
                <input type="text" value={callDraft.leTimestamp} readOnly />
              </label>
              <label className="form-field detail-row-wide">
                Location
                <input
                  type="text"
                  value={callDraft.pickupLocation}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, pickupLocation: event.target.value }))
                  }
                />
              </label>
            </div>
          ) : null}

          {callDraft.callType === "COD" ? (
            <div className="detail-grid-rows">
              <label className="form-field">
                Contact ID
                <input
                  type="text"
                  value={callDraft.contactId}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, contactId: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-right">
                Car type
                <input
                  type="text"
                  value={callDraft.vehicleType}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, vehicleType: event.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                Service Type
                <input
                  type="text"
                  value={callDraft.serviceType}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, serviceType: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-right">
                Service Charge ($)
                <input
                  type="text"
                  value={callDraft.serviceCharge}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, serviceCharge: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-wide">
                Pick up location
                <input
                  type="text"
                  value={callDraft.pickupLocation}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, pickupLocation: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-wide">
                Drop off location
                <input
                  type="text"
                  value={callDraft.dropoffLocation}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, dropoffLocation: event.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                Total tow miles
                <input
                  type="text"
                  readOnly
                  value={
                    towMilesLoading
                      ? "Calculating..."
                      : towMilesError
                        ? "Unavailable"
                        : towMiles != null
                          ? `${towMiles.toFixed(1)} mi`
                          : "--"
                  }
                />
              </label>
              <label className="form-field detail-row-right">
                Timestamp
                <input type="text" value={callDraft.codTimestamp} readOnly />
              </label>
            </div>
          ) : callDraft.callType === "PPI" ? (
            <div className="detail-grid-rows">
              <label className="form-field">
                Authorized by
                <input
                  type="text"
                  value={callDraft.contactId}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, contactId: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-right">
                Phone number
                <input
                  type="text"
                  value={callDraft.memberPhone}
                  onChange={(event) =>
                    setCallDraft((prev) => ({
                      ...prev,
                      memberPhone: formatPhoneInput(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="form-field detail-row-wide">
                Car type
                <input
                  type="text"
                  value={callDraft.vehicleType}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, vehicleType: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-wide">
                Pick up location
                <input
                  type="text"
                  value={callDraft.pickupLocation}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, pickupLocation: event.target.value }))
                  }
                />
              </label>
              <label className="form-field detail-row-wide">
                Reason
                <input
                  type="text"
                  value={callDraft.serviceType}
                  onChange={(event) =>
                    setCallDraft((prev) => ({ ...prev, serviceType: event.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                Timestamp
                <input type="text" value={callDraft.ppiTimestamp} readOnly />
              </label>
            </div>
          ) : null}

          <div className="detail-grid-rows">
            <label className="form-field detail-row-wide">
              Notes
              <textarea
                value={callDraft.notes}
                onChange={(event) =>
                  setCallDraft((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Notes"
              />
            </label>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => void handleCloseAddCall()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={callDraft.callType === "AAA" ? false : !overMilesChecklistComplete}
              title={
                callDraft.callType !== "AAA" && !overMilesChecklistComplete
                  ? "Complete the over miles checklist to save."
                  : undefined
              }
            >
              Save Call
            </button>
          </div>
        </>
      ) : null}
    </>
  );

  if (isDrawerWindow) {
    const drawerLookup = drawerCallId ? findDashboardCall(drawerCallId) : null;
    const drawerCall = drawerLookup?.call ?? null;
    const drawerDriver = drawerLookup?.driver ?? null;
    const drawerDetailCall = drawerCallDetail?.call ?? null;
    const weekStart = startOfWeek(new Date(nowMs));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekLabel = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
    return (
      <div
        ref={nonMainShellRef}
        className={`drawer-shell ${windowModeClass}${drawerMode === "weekly-schedule" ? " weekly-schedule-shell" : ""}`}
        onKeyDownCapture={handleNonMainEscapeCapture}
        onKeyUpCapture={handleNonMainEscapeCapture}
        tabIndex={-1}
      >
        {drawerMode === "weekly-schedule" ? (
          <div className="detail-card call-detail-card weekly-schedule-drawer">
            <header className="call-detail-header">
              <h3>Weekly Schedule</h3>
            </header>
            <div className="schedule-toolbar">
              <div>
                <p className="content-kicker">Employee schedule</p>
                <h2 className="schedule-title">Week of {weekLabel}</h2>
              </div>
              <div className="schedule-actions">
                <button className="ghost-button" onClick={() => setIsAddEmployeeOpen(true)}>
                  Add Driver
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    if (scheduleDrivers.length > 0) {
                      setDeleteEmployeeId(scheduleDrivers[0].id);
                    } else {
                      setDeleteEmployeeId("");
                    }
                    setIsDeleteEmployeeOpen(true);
                  }}
                >
                  Delete Driver
                </button>
                <button className="ghost-button" onClick={() => setIsAddShiftOpen(true)}>
                  Add Shift
                </button>
                <button className="ghost-button" onClick={handleClearWeek}>
                  Clear week
                </button>
              </div>
            </div>
            <section className="schedule-section">
              <h2 className="section-title">Drivers</h2>
              <div
                ref={weeklyGridRef}
                className="schedule-grid weekly-schedule-grid"
              >
                <div className="schedule-grid-header">
                  <div className="schedule-cell schedule-cell--head schedule-cell--corner">
                    Driver
                  </div>
                  {days.map((day) => (
                    <div key={day} className="schedule-cell schedule-cell--head">
                      {day}
                    </div>
                  ))}
                </div>
                {scheduleLoading ? (
                  <div className="schedule-empty">Loading schedule???</div>
                ) : scheduleError ? (
                  <div className="schedule-empty">{scheduleError}</div>
                ) : scheduleDrivers.length === 0 ? (
                  <div className="schedule-empty">No drivers yet.</div>
                ) : (
                  scheduleDrivers.map((employee) => (
                    <div key={employee.id} className="schedule-row">
                      <div className="schedule-cell schedule-cell--name">{employee.display_name}</div>
                      {days.map((day) => {
                        const dayIndex = days.indexOf(day);
                        const targetDate = new Date(weekStart);
                        targetDate.setDate(weekStart.getDate() + dayIndex);
                        const shift = scheduleShiftLookup.get(`${employee.id}-${dateKey(targetDate)}`);
                        return (
                          <div key={day} className="schedule-cell">
                            {shift ? (
                              <button
                                type="button"
                                className="shift-block"
                                onClick={() => {
                                  setEditingShift(shift);
                                  setEditDraft({
                                    start: isoToTimeInput(shift.shift_start),
                                    end: isoToTimeInput(shift.shift_end),
                                    lunchStart: isoToTimeInput(shift.lunch_start),
                                    lunchEnd: isoToTimeInput(shift.lunch_end),
                                    lunchOverride: false,
                                  });
                                }}
                              >
                                {formatIsoRange(shift.shift_start, shift.shift_end)}
                              </button>
                            ) : (
                              <span className="shift-empty">???</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </section>
            {isAddEmployeeOpen && (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <div className="modal-card">
                  <header className="modal-header">
                    <h3>Add Driver</h3>
                    <button className="modal-close" onClick={() => setIsAddEmployeeOpen(false)}>
                      Close
                    </button>
                  </header>
                  <form className="modal-body" onSubmit={handleAddEmployee}>
                    <label className="form-field">
                      Name
                      <input
                        type="text"
                        value={employeeDraft.name}
                        ref={employeeNameInputRef}
                        onChange={(event) =>
                          setEmployeeDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Driver name"
                        required
                      />
                    </label>
                    <label className="form-field">
                      Role
                      <input type="text" value="Driver" readOnly />
                    </label>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setIsAddEmployeeOpen(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="primary-button">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {isDeleteEmployeeOpen && (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <div className="modal-card">
                  <header className="modal-header">
                    <h3>Delete Driver</h3>
                    <button className="modal-close" onClick={() => setIsDeleteEmployeeOpen(false)}>
                      Close
                    </button>
                  </header>
                  <div className="modal-body">
                    {scheduleDrivers.length === 0 ? (
                      <div className="modal-summary">No drivers to delete.</div>
                    ) : (
                      <>
                        <label className="form-field">
                          Driver
                          <select
                            value={deleteEmployeeId}
                            onChange={(event) => setDeleteEmployeeId(event.target.value)}
                            required
                          >
                            {scheduleDrivers.map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.display_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="modal-summary">
                          {`Are you sure you want to delete ${
                            scheduleDrivers.find((employee) => employee.id === deleteEmployeeId)
                              ?.display_name ?? "this driver"
                          }?`}
                        </div>
                        <div className="modal-actions modal-actions--split">
                          <button
                            className="ghost-button"
                            onClick={() => setIsDeleteEmployeeOpen(false)}
                          >
                            No
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => {
                              if (!deleteEmployeeId) return;
                              handleDeleteEmployee(deleteEmployeeId);
                              setIsDeleteEmployeeOpen(false);
                            }}
                          >
                            Yes, delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {isAddShiftOpen && (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <div className="modal-card">
                  <header className="modal-header">
                    <h3>Add Shift</h3>
                    <button className="modal-close" onClick={() => setIsAddShiftOpen(false)}>
                      Close
                    </button>
                  </header>
                  <form className="modal-body" onSubmit={handleAddShift}>
                    <label className="form-field">
                      Driver
                      <select
                        value={shiftDraft.employeeId}
                        ref={shiftEmployeeSelectRef}
                        onChange={(event) =>
                          setShiftDraft((prev) => ({ ...prev, employeeId: event.target.value }))
                        }
                        required
                      >
                        <option value="" disabled>
                          Select driver
                        </option>
                        {scheduleDrivers.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      Days
                      <div className="day-picker">
                        {days.map((day) => {
                          const isSelected = shiftDraft.days.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              className={`day-chip${isSelected ? " is-selected" : ""}`}
                              onClick={() =>
                                setShiftDraft((prev) => {
                                  const exists = prev.days.includes(day);
                                  return {
                                    ...prev,
                                    days: exists
                                      ? prev.days.filter((value) => value !== day)
                                      : [...prev.days, day],
                                  };
                                })
                              }
                            >
                              <span className="day-label">{day}</span>
                              {isSelected && <span className="day-check">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </label>
                    <label className="form-field">
                      Lunch override
                      <select
                        value={shiftDraft.lunchOverride ? "yes" : "no"}
                        onChange={(event) =>
                          setShiftDraft((prev) => ({
                            ...prev,
                            lunchOverride: event.target.value === "yes",
                          }))
                        }
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                    <div className="form-row">
                      <label className="form-field">
                        Start
                        <input
                          type="time"
                          value={shiftDraft.start}
                          onChange={(event) =>
                            setShiftDraft((prev) => ({ ...prev, start: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="form-field">
                        End
                        <input
                          type="time"
                          value={shiftDraft.end}
                          onChange={(event) =>
                            setShiftDraft((prev) => ({ ...prev, end: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </div>
                    {shiftDraft.lunchOverride ? (
                      <div className="form-row">
                        <label className="form-field">
                          Lunch start
                          <input
                            type="time"
                            value={shiftDraft.lunchStart}
                            onChange={(event) =>
                              setShiftDraft((prev) => ({ ...prev, lunchStart: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label className="form-field">
                          Lunch end
                          <input
                            type="time"
                            value={shiftDraft.lunchEnd}
                            onChange={(event) =>
                              setShiftDraft((prev) => ({ ...prev, lunchEnd: event.target.value }))
                            }
                            required
                          />
                        </label>
                      </div>
                    ) : null}
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setIsAddShiftOpen(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="primary-button">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {editingShift && (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <div className="modal-card">
                  <header className="modal-header">
                    <h3>Edit Shift</h3>
                    <button className="modal-close" onClick={() => setEditingShift(null)}>
                      Close
                    </button>
                  </header>
                  <form className="modal-body" onSubmit={handleEditShiftSave}>
                    <div className="form-row">
                      <label className="form-field">
                        Start
                        <input
                          type="time"
                          value={editDraft.start}
                          onChange={(event) =>
                            setEditDraft((prev) => ({ ...prev, start: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="form-field">
                        End
                        <input
                          type="time"
                          value={editDraft.end}
                          onChange={(event) =>
                            setEditDraft((prev) => ({ ...prev, end: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <label className="form-field">
                      Lunch override
                      <select
                        value={editDraft.lunchOverride ? "yes" : "no"}
                        onChange={(event) =>
                          setEditDraft((prev) => ({
                            ...prev,
                            lunchOverride: event.target.value === "yes",
                          }))
                        }
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                    {editDraft.lunchOverride ? (
                      <div className="form-row">
                        <label className="form-field">
                          Lunch start
                          <input
                            type="time"
                            value={editDraft.lunchStart}
                            onChange={(event) =>
                              setEditDraft((prev) => ({ ...prev, lunchStart: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label className="form-field">
                          Lunch end
                          <input
                            type="time"
                            value={editDraft.lunchEnd}
                            onChange={(event) =>
                              setEditDraft((prev) => ({ ...prev, lunchEnd: event.target.value }))
                            }
                            required
                          />
                        </label>
                      </div>
                    ) : null}
                    <div className="modal-actions modal-actions--split">
                      <button type="button" className="danger-button" onClick={handleDeleteShift}>
                        Delete
                      </button>
                      <div className="modal-actions-right">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setEditingShift(null)}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="primary-button">
                          Save
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {isClearWeekOpen && (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <div className="modal-card">
                  <header className="modal-header">
                    <h3>Clear week</h3>
                    <button className="modal-close" onClick={handleCancelClearWeek}>
                      Close
                    </button>
                  </header>
                  <div className="modal-body">
                    <div className="modal-summary">
                      This will remove all shifts for the current week.
                    </div>
                    <div className="modal-actions modal-actions--split">
                      <button className="danger-button" onClick={handleConfirmClearWeek}>
                        Clear shifts
                      </button>
                      <div className="modal-actions-right">
                        <button className="ghost-button" onClick={handleCancelClearWeek}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : drawerMode === "new-call" ? (
          <div className="detail-card call-detail-card">
            <header className="call-detail-header add-call-header">
              <h3>Add Call</h3>
            </header>

            <form className="ocr-form" onSubmit={handleAddCallSubmit}>
              {renderAddCallFormFields()}
            </form>
          </div>
        ) : (
          <div className="detail-card call-detail-card">
            <header className="call-detail-header">
              <h3>Call Details</h3>
              <div className="call-detail-actions">
                {drawerDetailCall ? (
                  drawerEditing ? (
                    <>
                      <button
                        className="ghost-button"
                        onClick={() => {
                          hydrateDrawerEditDraft(drawerDetailCall);
                          setDrawerEditing(false);
                        }}
                        disabled={drawerSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        onClick={handleDrawerEditSave}
                        disabled={drawerSaving}
                      >
                        {drawerSaving ? "Saving..." : "Save"}
                      </button>
                    </>
                  ) : (
                    <button className="ghost-button" onClick={() => setDrawerEditing(true)}>
                      Edit
                    </button>
                  )
                ) : null}
                <button className="ghost-button" onClick={() => void closeDrawerWindow()}>
                  Close
                </button>
              </div>
            </header>
            {drawerCallLoading ? (
              <div className="driver-empty">Loading call…</div>
            ) : drawerCallError ? (
              <div className="driver-empty">{drawerCallError}</div>
            ) : !drawerDetailCall && !drawerCall ? (
              <div className="driver-empty">
                {dashboardError ?? "Call not found."}
              </div>
            ) : (
              <>
                {drawerEditing && drawerDetailCall ? (
                  <div className="detail-grid-rows">
                    <label className="form-field">
                      Call #
                      <input
                        type="text"
                        value={drawerEditDraft.external_call_number}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            external_call_number: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field detail-row-right">
                      Source type
                      <select
                        value={drawerEditDraft.source_type}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            source_type: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select source</option>
                        <option value="AAA">AAA</option>
                                                <option value="LAW_ENFORCEMENT">Law Enforcement</option>
                        <option value="COD">COD</option>
                        <option value="PPI">PPI</option>
                      </select>
                    </label>
                    {drawerEditDraft.source_type === "LAW_ENFORCEMENT" ? (
                      <label className="form-field">
                        Agency
                        <select
                          value={drawerEditDraft.law_agency}
                          onChange={(event) =>
                            setDrawerEditDraft((prev) => ({
                              ...prev,
                              law_agency: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select agency</option>
                          <option value="SDPD">SDPD</option>
                          <option value="CHP">CHP</option>
                          <option value="CVPD">CVPD</option>
                          <option value="SHERIFFS">Sheriffs</option>
                          <option value="COD">COD</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="form-field detail-row-wide">
                      Pickup
                      <input
                        type="text"
                        value={drawerEditDraft.pickup_address}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            pickup_address: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field detail-row-wide">
                      Drop-off
                      <input
                        type="text"
                        value={drawerEditDraft.dropoff_address}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            dropoff_address: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Contact ID
                      <input
                        type="text"
                        value={drawerEditDraft.contact_id}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            contact_id: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Phone
                      <input
                        type="text"
                        value={drawerEditDraft.callback_phone}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            callback_phone:
                              prev.source_type === "AAA"
                                ? event.target.value
                                : formatPhoneInput(event.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="form-field detail-row-right">
                      Vehicle
                      <input
                        type="text"
                        value={drawerEditDraft.vehicle_description}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            vehicle_description: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Membership
                      <input
                        type="text"
                        value={drawerEditDraft.membership_level}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            membership_level: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field detail-row-right">
                      Pricing total
                      <input
                        type="text"
                        value={drawerEditDraft.pricing_total}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            pricing_total: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field detail-row-wide">
                      Pricing notes
                      <input
                        type="text"
                        value={drawerEditDraft.pricing_notes}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            pricing_notes: event.target.value,
                          }))
                        }
                      />
                    </label>
                    {drawerEditDraft.source_type === "COD" || drawerEditDraft.source_type === "PPI" ? (
                      <>
                        <label className="form-field">
                          Payment Type
                          <input
                            type="text"
                            value={drawerEditDraft.payment_type}
                            onChange={(event) =>
                              setDrawerEditDraft((prev) => ({
                                ...prev,
                                payment_type: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="form-field detail-row-right">
                          Amount Paid
                          <input
                            type="text"
                            value={drawerEditDraft.amount_paid}
                            onChange={(event) =>
                              setDrawerEditDraft((prev) => ({
                                ...prev,
                                amount_paid: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    <label className="form-field detail-row-wide">
                      Notes
                      <textarea
                        value={drawerEditDraft.notes}
                        onChange={(event) =>
                          setDrawerEditDraft((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
                <div className="detail-grid-rows">
                  <div className="detail-row">
                    <span>Driver Name</span>
                    <span>{drawerDriver?.display_name ?? "Unassigned"}</span>
                  </div>
                  <div className="detail-row detail-row-right">
                    <span>Truck #</span>
                    <span>
                      {drawerDriver?.current_truck?.truck_number ?? "--"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span>Shift</span>
                    <span>{formatIsoTime(drawerDriver?.today_shift_start)}</span>
                  </div>
                  <div className="detail-row detail-row-right">
                    <span>Lunch</span>
                    <span>--</span>
                  </div>
                </div>

                <div className="detail-section-header">
                  <span>Call Info</span>
                </div>

                <div className="detail-grid-rows">
                  <div className="detail-row">
                    <span>Call #</span>
                    <span>{(drawerDetailCall ?? drawerCall)?.external_call_number ?? "--"}</span>
                  </div>
                  <div className="detail-row detail-row-right">
                    <span>Source</span>
                    <span>
                      {(drawerDetailCall ?? drawerCall)?.source_type}
                      {(drawerDetailCall ?? drawerCall)?.law_agency
                        ? ` · ${(drawerDetailCall ?? drawerCall)?.law_agency}`
                        : ""}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span>Status</span>
                    <span>{(drawerDetailCall ?? drawerCall)?.status}</span>
                  </div>
                  <div className="detail-row detail-row-right">
                    <span>Updated</span>
                    <span>{formatIsoTime((drawerDetailCall ?? drawerCall)?.status_updated_at)}</span>
                  </div>
                  <div className="detail-row detail-row-wide">
                    <span>Pickup</span>
                    <span>{(drawerDetailCall ?? drawerCall)?.pickup_address}</span>
                  </div>
                  {(drawerDetailCall ?? drawerCall)?.dropoff_address ? (
                    <div className="detail-row detail-row-wide">
                      <span>Drop-off</span>
                      <span>{(drawerDetailCall ?? drawerCall)?.dropoff_address}</span>
                    </div>
                  ) : null}
                  <div className="detail-row">
                    <span>Membership</span>
                    <span>{(drawerDetailCall ?? drawerCall)?.membership_level ?? "--"}</span>
                  </div>
                  <div className="detail-row detail-row-right">
                    <span>Pricing</span>
                    <span>{(drawerDetailCall ?? drawerCall)?.pricing_total ?? "--"}</span>
                  </div>
                  {(drawerDetailCall ?? drawerCall)?.source_type === "COD" ||
                  (drawerDetailCall ?? drawerCall)?.source_type === "PPI" ? (
                    <>
                      <div className="detail-row">
                        <span>Payment Type</span>
                        <span>
                          {extractNoteValue(
                            (drawerDetailCall ?? drawerCall)?.notes,
                            "Payment Type"
                          ) ?? "--"}
                        </span>
                      </div>
                      <div className="detail-row detail-row-right">
                        <span>Amount Paid</span>
                        <span>
                          {extractNoteValue(
                            (drawerDetailCall ?? drawerCall)?.notes,
                            "Amount Paid"
                          ) ?? "--"}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="detail-section-header">
                  <span>Customer Tracking</span>
                </div>
                <div className="detail-grid-rows">
                  {trackingLinkUrl ? (
                    <>
                      <div className="detail-row detail-row-wide">
                        <span>Tracking Link</span>
                        <span style={{ wordBreak: "break-all", fontSize: ".8rem" }}>
                          {trackingLinkUrl}
                        </span>
                      </div>
                      <div className="detail-row detail-row-wide" style={{ borderBottom: "none" }}>
                        <span />
                        <span>
                          <button
                            className="ghost-button"
                            onClick={() => {
                              void navigator.clipboard.writeText(trackingLinkUrl).then(() => {
                                setTrackingLinkCopied(true);
                                setTimeout(() => setTrackingLinkCopied(false), 2000);
                              });
                            }}
                          >
                            {trackingLinkCopied ? "Copied!" : "Copy Link"}
                          </button>
                          <button
                            className="ghost-button"
                            style={{ marginLeft: 8 }}
                            onClick={() => void handleGenerateTrackingLink()}
                            disabled={trackingLinkLoading}
                          >
                            {trackingLinkLoading ? "Rotating…" : "Rotate Link"}
                          </button>
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="detail-row detail-row-wide" style={{ borderBottom: "none" }}>
                      <span />
                      <span>
                        <button
                          className="ghost-button"
                          onClick={() => void handleGenerateTrackingLink()}
                          disabled={trackingLinkLoading}
                        >
                          {trackingLinkLoading ? "Generating…" : "Generate Tracking Link"}
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activeTabId === "reports") {
    contentBody = (
      <>
        <div className="hero-card">
          <p className="hero-label">Reports</p>
          <p className="hero-sub">Daily + driver reporting</p>
          <div className="hero-status">Open each report in its own window.</div>
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <h2>Daily Report</h2>
            <p>Today-only recap: COD/PPI, law enforcement, AAA members, and notes.</p>
            <button className="ghost-button" onClick={() => void handleOpenReportWindow("daily")}>
              Open Daily Report
            </button>
          </article>
          <article className="detail-card">
            <h2>Driver Report</h2>
            <p>Date range view with per-call timing, averages, and totals.</p>
            <button className="ghost-button" onClick={() => void handleOpenReportWindow("driver")}>
              Open Driver Report
            </button>
          </article>
        </div>
      </>
    );
  } else if (activeTabId === "calls") {
    const activeDriverCards = dashboardDrivers.filter(
      (driver) =>
        (driver.active_call || driver.pending_queue.length > 0) &&
        driver.availability_status !== "ON_LUNCH"
    );
    contentBody = (
      <div className="calls-layout">
        <div className="calls-main">
          <div className="calls-header">
            <div>
              <p className="content-kicker">Active calls</p>
            </div>
            <div className="calls-header-actions">
              <button
                className="section-toggle"
                type="button"
                onClick={() =>
                  setCallsSectionsOpen((prev) => ({
                    ...prev,
                    active: !prev.active,
                  }))
                }
                aria-label={callsSectionsOpen.active ? "Collapse active calls" : "Expand active calls"}
              >
                {callsSectionsOpen.active ? "▾" : "▸"}
              </button>
            </div>
          </div>

          {callsSectionsOpen.active ? (
            dashboardLoading ? (
              <div className="driver-empty">Loading dashboard…</div>
            ) : dashboardError ? (
              <div className="driver-empty">{dashboardError}</div>
            ) : activeDriverCards.length === 0 ? (
              <div className="driver-empty">No active drivers assigned.</div>
            ) : (
              <div className="call-grid">
                {activeDriverCards.map((driver) => {
                  const call = driver.active_call;
                  const queuedCalls = driver.pending_queue;
                  if (!call) {
                    return (
                      <article
                        key={driver.driver_id}
                        className="call-card call-card-queued"
                      >
                        <header className="call-card-header">
                          <div className="call-header-left">
                            <h3>{driver.display_name}</h3>
                            <span className="call-subtext">
                              Shift:{" "}
                              {driver.today_shift_start ? formatIsoTime(driver.today_shift_start) : "--"}
                            </span>
                          </div>
                          <div className="call-header-center">
                            <select
                              className="driver-status-select"
                              value={driver.availability_status}
                              onChange={(event) => {
                                handleAvailabilityChange(driver.driver_id, event.target.value);
                              }}
                            >
                              <option value="AVAILABLE">AVAILABLE</option>
                              <option value="ON_LUNCH">ON_LUNCH</option>
                              <option value="BUSY">BUSY</option>
                              <option value="OFF_SHIFT">OFF_SHIFT</option>
                            </select>
                          </div>
                          <div className="call-header-right">
                            <span className="call-status-code">—</span>
                            <span className="call-status-line">No active call</span>
                          </div>
                        </header>
                        <div className="call-summary">
                          <div className="call-summary-row">
                            <span className="call-label">Active</span>
                            <span className="call-value">No active call assigned.</span>
                          </div>
                        </div>
                        <div className="call-queue">
                          <div className="call-queue-title">Queued Calls</div>
                          <div
                            className={`call-queue-list${
                              dragOverDriverId === driver.driver_id ? " is-drag-over" : ""
                            }`}
                            onDragOver={(event) => event.preventDefault()}
                            onDragEnter={() => setDragOverDriverId(driver.driver_id)}
                            onDragLeave={() => setDragOverDriverId(null)}
                            onDrop={(event) =>
                              handleDropToDriverQueue(event, driver.driver_id, queuedCalls.length + 1)
                            }
                          >
                            {queuedCalls.length === 0 ? (
                              <div className="call-queue-empty">No assigned calls queued.</div>
                            ) : (
                              queuedCalls.map((queued) => (
                                <div
                                  key={queued.call_id}
                                  data-call-id={queued.call_id}
                                  draggable
                                  onDragStart={(event) =>
                                    handleDragStart(event, {
                                      callId: queued.call_id,
                                      fromOwner: { type: "driver", driverId: driver.driver_id },
                                    })
                                  }
                                  onDragEnd={handleDragEnd}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const midpoint = rect.top + rect.height / 2;
                                    const placement = event.clientY < midpoint ? "before" : "after";
                                    setDragOverCallId(queued.call_id);
                                    setDragOverPlacement(placement);
                                  }}
                                  onDragLeave={() => {
                                    setDragOverCallId(null);
                                    setDragOverPlacement(null);
                                  }}
                                  onDrop={(event) => {
                                    const placement = dragOverPlacement ?? "after";
                                    const index = queuedCalls.findIndex((item) => item.call_id === queued.call_id);
                                    const position = placement === "before" ? index + 1 : index + 2;
                                    handleDropToDriverQueue(event, driver.driver_id, position);
                                  }}
                                  className={`call-queue-row${
                                    dragOverCallId === queued.call_id
                                      ? dragOverPlacement === "before"
                                        ? " is-drop-before"
                                        : " is-drop-after"
                                      : ""
                                  }`}
                                >
                                  <span className="call-queue-type">{queued.source_type}</span>
                                  <span className="call-queue-address">{queued.pickup_address}</span>
                                  {queued.dropoff_address ? (
                                    <span className="call-queue-tow">
                                      {callTowMilesLoading[queued.call_id]
                                        ? "Tow miles: …"
                                        : callTowMiles[queued.call_id] != null
                                          ? `Tow miles: ${callTowMiles[queued.call_id].toFixed(1)}`
                                          : callTowMilesError[queued.call_id]
                                            ? (
                                              <span title={callTowMilesError[queued.call_id]}>
                                                Tow miles: Unavailable
                                              </span>
                                            )
                                            : "Tow miles: --"}
                                    </span>
                                  ) : null}
                                  <button
                                    className="ghost-button call-queue-activate"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handlePromoteCall(queued.call_id, driver.driver_id);
                                    }}
                                  >
                                    Activate
                                  </button>
                                  <select
                                    className="call-queue-reassign"
                                    value={driver.driver_id}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => {
                                      const nextId = event.target.value;
                                      if (!nextId) {
                                        void handleQueueMove(
                                          queued.call_id,
                                          { type: "driver", driverId: driver.driver_id },
                                          { type: "unassigned" },
                                          1
                                        );
                                        return;
                                      }
                                      if (nextId !== driver.driver_id) {
                                        void handleQueueMove(
                                          queued.call_id,
                                          { type: "driver", driverId: driver.driver_id },
                                          { type: "driver", driverId: nextId },
                                          999999
                                        );
                                      }
                                    }}
                                  >
                                    <option value={driver.driver_id}>Reassign...</option>
                                    <option value="">Unassign (back to pending)</option>
                                    {dashboardDrivers
                                      .filter((candidate) => candidate.driver_id !== driver.driver_id)
                                      .map((candidate) => (
                                        <option key={candidate.driver_id} value={candidate.driver_id}>
                                          Move → {candidate.display_name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  }
                  const statusTime = formatIsoTime(call.status_updated_at);
                  return (
                    <article
                      key={call.call_id}
                      className={`call-card${selectedDriverId === driver.driver_id ? " is-selected" : ""}`}
                    >
                      <header className="call-card-header">
                        <div className="call-header-left">
                          <h3>{driver.display_name}</h3>
                          <span className="call-subtext">
                            Shift:{" "}
                            {driver.today_shift_start ? formatIsoTime(driver.today_shift_start) : "--"}
                          </span>
                        </div>
                        <div className="call-header-center">
                          {driver.current_truck ? (
                            <span className="call-subtext">
                              Truck: {driver.current_truck.truck_number}
                              {driver.current_truck.truck_type ? ` (${driver.current_truck.truck_type})` : ""}
                            </span>
                          ) : null}
                        </div>
                        <div className="call-header-right">
                          <span className="call-status-code">{call.status}</span>
                          <span className="call-status-line">{statusTime}</span>
                          <button
                            className="call-card-menu"
                            type="button"
                            aria-label="Open call details"
                            onClick={(event) => {
                              setSelectedDriverId(driver.driver_id);
                              void openFloatingDetail(event, call.call_id, driver.driver_id);
                            }}
                          >
                            <span aria-hidden="true">⋮</span>
                          </button>
                        </div>
                      </header>
                      <div className="call-summary">
                        <div className="call-summary-row">
                          <span className="call-label">Type</span>
                          <span className="call-value">
                            {call.source_type}
                          </span>
                        </div>
                        <div className="call-summary-row">
                          <span className="call-label">Assigned</span>
                          <span className="call-value">
                            <select
                              className="driver-status-select"
                              value={driver.driver_id}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation();
                                const nextId = event.target.value;
                                if (!nextId) {
                                  void handleActiveReassign(call.call_id, driver.driver_id, null);
                                  return;
                                }
                                if (nextId !== driver.driver_id) {
                                  void handleActiveReassign(call.call_id, driver.driver_id, nextId);
                                }
                              }}
                            >
                              <option value={driver.driver_id}>Assigned</option>
                              <option value="">Unassign</option>
                              {dashboardDrivers
                                .filter((candidate) => candidate.driver_id !== driver.driver_id)
                                .map((candidate) => (
                                  <option key={candidate.driver_id} value={candidate.driver_id}>
                                    Move → {candidate.display_name}
                                  </option>
                                ))}
                            </select>
                          </span>
                        </div>
                        <div className="call-summary-row">
                          <span className="call-label">Pickup</span>
                          <span className="call-value">{call.pickup_address}</span>
                        </div>
                        {call.dropoff_address ? (
                          <div className="call-summary-row">
                            <span className="call-label">Drop-off</span>
                            <span className="call-value">{call.dropoff_address}</span>
                          </div>
                        ) : null}
                        {call.dropoff_address ? (
                          <div className="call-summary-row">
                            <span className="call-label">Total tow miles</span>
                            <span className="call-value">
                              {callTowMilesLoading[call.call_id]
                                ? "Calculating..."
                                : callTowMiles[call.call_id] != null
                                  ? `${callTowMiles[call.call_id].toFixed(1)} mi`
                                  : callTowMilesError[call.call_id]
                                    ? (
                                      <span title={callTowMilesError[call.call_id]}>
                                        Unavailable
                                      </span>
                                    )
                                    : "--"}
                            </span>
                          </div>
                        ) : null}
                        <div className="call-summary-row">
                          <span className="call-label">Membership</span>
                          <span className="call-value">{call.membership_level ?? "--"}</span>
                        </div>
                        {call.notes ? (
                          <div className="call-summary-row">
                            <span className="call-label">Notes</span>
                            <span className="call-value">{call.notes}</span>
                          </div>
                        ) : null}
                      </div>
                      {call.source_type === "AAA"
                        ? isCallOverMiles(call.call_id, call.membership_level)
                          ? renderAaaFlaggedChecklist(call.call_id)
                          : null
                        : null}
                      <div className="call-status-buttons">
                        {statusOptions.map((status) => (
                          <button
                            key={status}
                            className={`status-pill status-${statusToClass(status)}${call.status === status ? " is-active" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleStatusClick(call.call_id, status, driver.driver_id);
                            } }
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                      {call.status === "98" && call.source_type === "AAA" ? (
                        <div className="call-checklist">
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getChecklist(call.call_id).updateAaa}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleChecklist(call.call_id, "updateAaa");
                              } } />
                            <span>Updated AAA</span>
                          </label>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getChecklist(call.call_id).setResolution}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleChecklist(call.call_id, "setResolution");
                              } } />
                            <span>Set resolution</span>
                          </label>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getChecklist(call.call_id).clearConsole}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleChecklist(call.call_id, "clearConsole");
                              } } />
                            <span>Cleared console</span>
                          </label>
                          {clearErrors[call.call_id] ? (
                            <div className="form-error">{clearErrors[call.call_id]}</div>
                          ) : null}
                        </div>
                      ) : null}
                      {call.status === "95" && call.source_type === "AAA" ? (
                        <div className="call-checklist">
                          <div className="call-checklist-title">Status 95 Checklist (NSR)</div>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getNsrChecklist(call.call_id).standbyFive}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleNsrChecklist(call.call_id, "standbyFive");
                              } } />
                            <span>Notify driver to stand by for 5 mins</span>
                          </label>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getNsrChecklist(call.call_id).contactMember}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleNsrChecklist(call.call_id, "contactMember");
                              } } />
                            <span>Attempt to contact member</span>
                          </label>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getNsrChecklist(call.call_id).updateAaa}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleNsrChecklist(call.call_id, "updateAaa");
                              } } />
                            <span>Update the AAA feed</span>
                          </label>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getNsrChecklist(call.call_id).requestNsr}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleNsrChecklist(call.call_id, "requestNsr");
                              } } />
                            <span>Request NSR</span>
                          </label>
                          <label className="checklist-item">
                            <input
                              type="checkbox"
                              checked={getNsrChecklist(call.call_id).clearCallNsr}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleNsrChecklist(call.call_id, "clearCallNsr");
                              } } />
                            <span>Clear call w/ resolution NSR</span>
                          </label>
                          {nsrErrors[call.call_id] ? (
                            <div className="form-error">{nsrErrors[call.call_id]}</div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="call-status-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openDrawerWindow("call-detail", call.call_id, true);
                          } }
                        >
                          Edit
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={async (event) => {
                            event.stopPropagation();
                            console.log("COMPLETE CLICKED", call.call_id);
                            await handleCompleteCall(call.call_id, driver.driver_id);
                          } }
                        >
                          {completeLoading[call.call_id] ? "Completing..." : "Complete"}
                        </button>
                    </div><div className="call-queue">
                        <div className="call-queue-title">Queued Calls</div>
                        <div
                          className={`call-queue-list${dragOverDriverId === driver.driver_id ? " is-drag-over" : ""}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDragEnter={() => setDragOverDriverId(driver.driver_id)}
                          onDragLeave={() => setDragOverDriverId(null)}
                          onDrop={(event) => handleDropToDriverQueue(event, driver.driver_id, queuedCalls.length + 1)}
                        >
                          {queuedCalls.length === 0 ? (
                            <div className="call-queue-empty">No assigned calls queued.</div>
                          ) : (
                            queuedCalls.map((queued) => (
                              <div
                                key={queued.call_id}
                                data-call-id={queued.call_id}
                                draggable
                                onDragStart={(event) => handleDragStart(event, {
                                  callId: queued.call_id,
                                  fromOwner: { type: "driver", driverId: driver.driver_id },
                                })}
                                onDragEnd={handleDragEnd}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const midpoint = rect.top + rect.height / 2;
                                  const placement = event.clientY < midpoint ? "before" : "after";
                                  setDragOverCallId(queued.call_id);
                                  setDragOverPlacement(placement);
                                } }
                                onDragEnter={() => setDragOverCallId(queued.call_id)}
                                onDragLeave={() => {
                                  setDragOverCallId(null);
                                  setDragOverPlacement(null);
                                } }
                                className={`call-queue-row${dragOverCallId === queued.call_id ? " is-drag-over" : ""}${dragOverCallId === queued.call_id && dragOverPlacement
                                    ? dragOverPlacement === "after"
                                      ? " is-drop-after"
                                      : " is-drop-before"
                                    : ""}`}
                                onDrop={(event) => (() => {
                                  event.stopPropagation();
                                  return handleDropToDriverQueue(
                                    event,
                                    driver.driver_id,
                                    queuedCalls.findIndex((item) => item.call_id === queued.call_id) +
                                    (dragOverPlacement === "after" ? 1 : 0) +
                                    1
                                  );
                                })()}
                              >
                                <span className="call-queue-type">{queued.source_type}</span>
                                <span className="call-queue-address">{queued.pickup_address}</span>
                                {queued.dropoff_address ? (
                                  <span className="call-queue-tow">
                                    {callTowMilesLoading[queued.call_id]
                                      ? "Tow miles: …"
                                      : callTowMiles[queued.call_id] != null
                                        ? `Tow miles: ${callTowMiles[queued.call_id].toFixed(1)}`
                                        : callTowMilesError[queued.call_id]
                                          ? (
                                            <span title={callTowMilesError[queued.call_id]}>
                                              Tow miles: Unavailable
                                            </span>
                                          )
                                          : "Tow miles: --"}
                                  </span>
                                ) : null}
                                <button
                                  className="ghost-button call-queue-activate"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handlePromoteCall(queued.call_id, driver.driver_id);
                                  } }
                                >
                                  Activate
                                </button>
                                <select
                                  className="call-queue-reassign"
                                  value={driver.driver_id}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => {
                                    const nextId = event.target.value;
                                    if (!nextId) {
                                      void handleQueueMove(
                                        queued.call_id,
                                        { type: "driver", driverId: driver.driver_id },
                                        { type: "unassigned" },
                                        1
                                      );
                                      return;
                                    }
                                    if (nextId !== driver.driver_id) {
                                      void handleQueueMove(
                                        queued.call_id,
                                        { type: "driver", driverId: driver.driver_id },
                                        { type: "driver", driverId: nextId },
                                        999999
                                      );
                                    }
                                  } }
                                >
                                  <option value={driver.driver_id}>Reassign...</option>
                                  <option value="">Unassign (back to pending)</option>
                                  {dashboardDrivers
                                    .filter((candidate) => candidate.driver_id !== driver.driver_id)
                                    .map((candidate) => (
                                      <option key={candidate.driver_id} value={candidate.driver_id}>
                                        Move → {candidate.display_name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </article>
                );
              })}
            </div>
          )) : (
            <div className="driver-empty">Active calls hidden.</div>
          )}



          <section className="driver-section">
            <div className="driver-section-header">
              <h2>PENDING CALLS</h2>
              <div className="driver-section-actions">
                <span className="driver-section-meta">
                  <span className="count-badge">{dashboardUnassigned.length}</span>
                </span>
                <button
                  className="section-toggle"
                  type="button"
                  onClick={() =>
                    setCallsSectionsOpen((prev) => ({
                      ...prev,
                      pending: !prev.pending,
                    }))
                  }
                  aria-label={callsSectionsOpen.pending ? "Collapse pending calls" : "Expand pending calls"}
                >
                  {callsSectionsOpen.pending ? "▾" : "▸"}
                </button>
              </div>
            </div>
            {callsSectionsOpen.pending ? (
              <>
                <div
                  className={`pending-calls${dragOverUnassigned ? " is-drag-over" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => setDragOverUnassigned(true)}
                  onDragLeave={() => setDragOverUnassigned(false)}
                  onDrop={(event) => {
                    setDragOverUnassigned(false);
                    return handleDropToUnassigned(event);
                  }}
                >
                  {dashboardUnassigned.length === 0 ? (
                    <div className="driver-empty">No pending calls right now.</div>
                  ) : (
                    dashboardUnassigned.map((call) => {
                        const isSelected = selectedPendingCallIds.has(call.call_id);
                        const workTypeId =
                          extractNoteValue(call.notes, "Work Type ID") ??
                          extractNoteValue(call.notes, "Work Type 1D") ??
                          extractNoteValue(call.notes, "Work Type lD") ??
                          extractNoteValue(call.notes, "WorkTypeID") ??
                          extractNoteValue(call.notes, "Work Type") ??
                          "--";
                        const carTypeText =
                          call.vehicle_description?.trim() ||
                          extractNoteValue(call.notes, "Car Type") ||
                          extractNoteValue(call.notes, "Member Vehicle Name") ||
                          extractNoteValue(call.notes, "Member Vehicle") ||
                          extractNoteValue(call.notes, "Vehicle Name") ||
                          extractNoteValue(call.notes, "Vehicle Type") ||
                          extractNoteValue(call.notes, "Vehicle") ||
                          "--";
                        const towMilesText =
                          callTowMilesLoading[call.call_id]
                            ? "Calculating..."
                            : callTowMiles[call.call_id] != null
                              ? `${callTowMiles[call.call_id].toFixed(1)} mi`
                              : callTowMilesError[call.call_id]
                                ? "Unavailable"
                                : "--";
                        return (
                          <article
                            key={call.call_id}
                            className="pending-call-card"
                            draggable
                            onDragStart={(event) =>
                              handleDragStart(event, {
                                callId: call.call_id,
                                fromOwner: { type: "unassigned" },
                              })
                            }
                            onDragEnd={handleDragEnd}
                          >
                            <div className="pending-card-actions">
                              <label className="pending-select">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(event) => {
                                    event.stopPropagation();
                                    setSelectedPendingCallIds((prev) => {
                                      const next = new Set(prev);
                                      if (event.target.checked) {
                                        next.add(call.call_id);
                                      } else {
                                        next.delete(call.call_id);
                                      }
                                      return next;
                                    });
                                  }}
                                />
                                <span>Select</span>
                              </label>
                              <button
                                className="ghost-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCancelCalls([call.call_id]);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                            <header className="pending-call-header">
                              <h3>Pending Call</h3>
                              <div className="pending-assign-inline">
                                <span>Assign Driver</span>
                                <select
                                  value=""
                                  draggable={false}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onChange={(event) => {
                                    event.stopPropagation();
                                    const nextId = event.target.value;
                                    if (!nextId) return;
                                    void handleQueueMove(
                                      call.call_id,
                                      { type: "unassigned" },
                                      { type: "driver", driverId: nextId },
                                      999999
                                    );
                                  }}
                                >
                                  <option value="">Unassigned</option>
                                  {dashboardDrivers.map((eligible) => (
                                    <option key={eligible.driver_id} value={eligible.driver_id}>
                                      {eligible.display_name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="call-card-menu"
                                  type="button"
                                  aria-label="Open call details"
                                  onClick={(event) => void openFloatingDetail(event, call.call_id, null)}
                                >
                                  <span aria-hidden="true">⋮</span>
                                </button>
                              </div>
                            </header>
                            <div className="pending-call-grid pending-call-grid--double">
                              <div className="pending-column">
                                <div className="pending-field">
                                  <span>Call #</span>
                                  <span>{call.external_call_number ?? call.call_id.slice(0, 8)}</span>
                                </div>
                                <div className="pending-field">
                                  <span>Work Type ID</span>
                                  <span>{workTypeId}</span>
                                </div>
                                <div className="pending-field">
                                  <span>Car Type</span>
                                  <span>{carTypeText}</span>
                                </div>
                                <div className="pending-field wide">
                                  <span>Pick Up</span>
                                  <span>{call.pickup_address ?? "--"}</span>
                                </div>
                                <div className="pending-field wide">
                                  <span>Drop Off</span>
                                  <span>{call.dropoff_address ?? "--"}</span>
                                </div>
                              </div>
                              <div className="pending-column">
                                <div className="pending-field">
                                  <span>Call Type</span>
                                  <span>{call.source_type}</span>
                                </div>
                                <div className="pending-field">
                                  <span>Membership</span>
                                  <span>{call.membership_level ?? "--"}</span>
                                </div>
                                <div className="pending-field">
                                  <span>Total Tow Miles</span>
                                  <span>{towMilesText}</span>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                  )}
                </div>
              </>
            ) : (
              <div className="driver-empty">Pending calls hidden.</div>
            )}
          </section>
        </div>

        <div className="calls-rail">
          <section className="driver-section">
            <div className="driver-section-header">
              <h2>AVAILABLE DRIVERS</h2>
              <div className="driver-section-actions">
                <span className="driver-section-meta">
                  <span className="count-badge">{dashboardDrivers.length}</span>
                </span>
                <button
                  className="section-toggle"
                  type="button"
                  onClick={() =>
                    setCallsSectionsOpen((prev) => ({
                      ...prev,
                      drivers: !prev.drivers,
                    }))
                  }
                  aria-label={callsSectionsOpen.drivers ? "Collapse available drivers" : "Expand available drivers"}
                >
                  {callsSectionsOpen.drivers ? "▾" : "▸"}
                </button>
              </div>
            </div>
            {callsSectionsOpen.drivers ? (
              sortedDrivers.length === 0 ? (
                <div className="driver-empty">No drivers on shift right now.</div>
              ) : (
                (["AVAILABLE", "ON_LUNCH"] as const).map((status) => {
                  const group = sortedDrivers.filter(
                    (driver) => getDriverDisplayStatus(driver) === status
                  );
                  if (group.length === 0) return null;
                  return (
                    <div key={status} className="driver-status-group">
                      <div className="driver-status-header">
                        <h3>{status.replace("_", " ")}</h3>
                        <span>{group.length}</span>
                      </div>
                      <div className="driver-grid">
                        {group.map((driver, index) => {
                          const displayStatus = getDriverDisplayStatus(driver);
                          const locationDraft = driverLocationDrafts[driver.driver_id] ?? "";
                          return (
                            <article
                              key={driver.driver_id}
                              className={`driver-card detail-card${
                                selectedDriverId === driver.driver_id ? " is-selected" : ""
                              }`}
                              onClick={() => setSelectedDriverId(driver.driver_id)}
                            >
                              <div className="driver-card-header">
                                <div>
                                  <h3>{driver.display_name}</h3>
                                  <span className="driver-sub">
                                    Shift: {driver.today_shift_start ? formatIsoTime(driver.today_shift_start) : "--"}
                                  </span>
                                </div>
                                <div className="driver-card-tags">
                                  <span className="driver-index">#{String(index + 1).padStart(2, "0")}</span>
                                </div>
                              </div>
                              <div className="driver-meta-row">
                                <span>Truck</span>
                                <span className="driver-meta-value">
                                  {driver.current_truck
                                    ? `${driver.current_truck.truck_number}${driver.current_truck.truck_type ? ` (${driver.current_truck.truck_type})` : ""}`
                                    : "--"}
                                </span>
                              </div>
                              <div className="driver-meta-row">
                                <span>Lunch</span>
                                <span className="driver-meta-value">--</span>
                              </div>
                              <div className="driver-meta-row">
                                <span>Status</span>
                                <span className="driver-meta-value">{displayStatus}</span>
                              </div>
                              {displayStatus === "AVAILABLE" ? (
                                <div className="driver-meta-row driver-meta-row-location">
                                  <span>Last location</span>
                                  <span className="driver-meta-value driver-location">
                                    <input
                                      className="driver-location-input"
                                      value={locationDraft}
                                      onChange={(event) => {
                                        const cleaned = sanitizeLocation(event.target.value);
                                        setDriverLocationDrafts((prev) => ({
                                          ...prev,
                                          [driver.driver_id]: cleaned,
                                        }));
                                      }}
                                      onBlur={() => {
                                        void handleDriverLocationSave(driver);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          (event.target as HTMLInputElement).blur();
                                          void handleDriverLocationSave(driver);
                                        }
                                      }}
                                      placeholder="--"
                                    />
                                    <span className="driver-location-time">
                                      {driver.last_location_updated_at
                                        ? formatIsoTime(driver.last_location_updated_at)
                                        : "--"}
                                    </span>
                                  </span>
                                </div>
                              ) : null}
                              <div className="driver-actions">
                                <div className="driver-action-meta">
                                  <select
                                    className="driver-status-select"
                                    value={displayStatus}
                                    onChange={(event) =>
                                      handleAvailabilityChange(driver.driver_id, event.target.value)
                                    }
                                  >
                                    <option value="AVAILABLE">AVAILABLE</option>
                                    <option value="ON_LUNCH">ON_LUNCH</option>
                                    <option value="BUSY">BUSY</option>
                                    <option value="OFF_SHIFT">OFF_SHIFT</option>
                                  </select>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              <div className="driver-empty">Available drivers hidden.</div>
            )}
          </section>
        </div>

      </div>
    );
  } else if (activeTabId === "calculators") {
    const dateRangeInvalid = Boolean(
      storageDateIn &&
        storageDateOut &&
        inclusiveDateDiffDays(storageDateIn, storageDateOut) === null
    );
    const towingDateInvalid = Boolean(
      towingDateIn &&
        towingDateOut &&
        inclusiveDateDiffDays(towingDateIn, towingDateOut) === null
    );
    const chpDateInvalid = Boolean(
      chpDateIn && chpDateOut && inclusiveDateDiffDays(chpDateIn, chpDateOut) === null
    );
    const sdDateInvalid = Boolean(
      sdDateIn && sdDateOut && inclusiveDateDiffDays(sdDateIn, sdDateOut) === null
    );
    const sheriffDateInvalid = Boolean(
      sheriffDateIn &&
        sheriffDateOut &&
        inclusiveDateDiffDays(sheriffDateIn, sheriffDateOut) === null
    );
    const cvpdDateInvalid = Boolean(
      cvpdDateIn &&
        cvpdDateOut &&
        inclusiveDateDiffDays(cvpdDateIn, cvpdDateOut) === null
    );
    const towingIsLienApplied = towingCalc.days != null && towingCalc.days >= 3;
    const chpIsLienApplied = chpCalc.days != null && chpCalc.days >= 3;
    const sdIsLienApplied = sdCalc.days != null && sdCalc.days >= 3;
    const sheriffIsLienApplied = sheriffCalc.days != null && sheriffCalc.days >= 3;
    const cvpdIsLienApplied = cvpdCalc.days != null && cvpdCalc.days >= 3;
    const towFeeAmount = parseOptionalNumber(storageTowFee);
    const calendarLabel = storageCalendarMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    contentBody = (
      <>
        <section className="calculator-selector">
          <button
            className={`ghost-button${activeCalculatorId === "storage" ? " is-active" : ""}`}
            onClick={() => setActiveCalculatorId("storage")}
          >
            Storage Fee
          </button>
          <button
            className={`ghost-button${activeCalculatorId === "towing" ? " is-active" : ""}`}
            onClick={() => setActiveCalculatorId("towing")}
          >
            Towing Rates
          </button>
          <button
            className={`ghost-button${activeCalculatorId === "over-miles" ? " is-active" : ""}`}
            onClick={() => setActiveCalculatorId("over-miles")}
          >
            Over Miles
          </button>
        </section>

        {activeCalculatorId === "storage" ? (
          <>
            <section className="detail-card calculator-card">
              <h2>Storage Fee Calculator</h2>
              <p className="content-subtitle">Date in/out are counted as full days.</p>
              <div className="calculator-grid">
                <div className="form-row">
                  <label className="form-field">
                    Tow fee (optional)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={storageTowFee}
                      onChange={(event) => {
                        setStorageTowFee(event.target.value);
                        resetStorageCalc(true);
                      }}
                      placeholder="0.00"
                    />
                  </label>
                  <label className="form-field">
                    Storage fee (required)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={storageDailyFee}
                      onChange={(event) => {
                        setStorageDailyFee(event.target.value);
                        resetStorageCalc(true);
                      }}
                      placeholder="Daily rate"
                      required
                    />
                  </label>
                </div>

                <div className="calculator-calendar">
                  <div className="calendar-header">
                    <button
                      type="button"
                      className="calendar-nav"
                      onClick={() =>
                        setStorageCalendarMonth((prev) => {
                          const next = new Date(prev);
                          next.setMonth(prev.getMonth() - 1);
                          return startOfMonth(next);
                        })
                      }
                    >
                      ◀
                    </button>
                    <div className="calendar-title">{calendarLabel}</div>
                    <button
                      type="button"
                      className="calendar-nav"
                      onClick={() =>
                        setStorageCalendarMonth((prev) => {
                          const next = new Date(prev);
                          next.setMonth(prev.getMonth() + 1);
                          return startOfMonth(next);
                        })
                      }
                    >
                      ▶
                    </button>
                  </div>
                  <div className="calendar-targets">
                    <button
                      type="button"
                      className={`ghost-button${storageCalendarTarget === "in" ? " is-active" : ""}`}
                      onClick={() => setStorageCalendarTarget("in")}
                    >
                      Date In
                    </button>
                    <button
                      type="button"
                      className={`ghost-button${storageCalendarTarget === "out" ? " is-active" : ""}`}
                      onClick={() => setStorageCalendarTarget("out")}
                    >
                      Date Out
                    </button>
                  </div>
                  <div className="calendar-grid">
                    {calendarWeekdays.map((day) => (
                      <div key={day} className="calendar-weekday">
                        {day}
                      </div>
                    ))}
                    {storageCalendarCells.map((day, index) => {
                      if (!day) {
                        return <div key={`empty-${index}`} className="calendar-cell calendar-empty" />;
                      }
                      const dayKey = dateKey(day);
                      const isSelected = dayKey === storageDateIn || dayKey === storageDateOut;
                      const isRangeStart = dayKey === storageDateIn;
                      const isRangeEnd = dayKey === storageDateOut;
                      return (
                        <button
                          key={dayKey}
                          type="button"
                          className={`calendar-cell${isSelected ? " is-selected" : ""}${
                            isRangeStart ? " is-start" : ""
                          }${isRangeEnd ? " is-end" : ""}`}
                          onClick={() => {
                            if (storageCalendarTarget === "in") {
                              setStorageDateIn(dayKey);
                            } else {
                              setStorageDateOut(dayKey);
                            }
                            resetStorageCalc(true);
                          }}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Date in
                    <input
                      type="date"
                      value={storageDateIn}
                      onChange={(event) => {
                        setStorageDateIn(event.target.value);
                        resetStorageCalc(true);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    Date out
                    <input
                      type="date"
                      value={storageDateOut}
                      onChange={(event) => {
                        setStorageDateOut(event.target.value);
                        resetStorageCalc(true);
                      }}
                    />
                  </label>
                </div>
                {dateRangeInvalid ? (
                  <div className="form-error">Date out must be the same day or after date in.</div>
                ) : null}
                {storageCalcError ? <div className="form-error">{storageCalcError}</div> : null}

                <div className="form-row">
                  <label className="form-field">
                    Days in storage
                    <input
                      type="text"
                      readOnly
                      value={storageCalc.days == null ? "--" : String(storageCalc.days)}
                    />
                  </label>
                  <label className="form-field">
                    Total storage fee
                    <input
                      type="text"
                      readOnly
                      value={
                        storageCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(storageCalc.storageTotal)
                      }
                    />
                  </label>
                </div>

                {storageIsLienApplied ? (
                  <div className="calculator-lien">
                    <div className="calculator-lien-header">
                      <div>
                        <p className="content-subtitle">Lien fee applied</p>
                        <div className="calculator-lien-note">
                          {storageLienOverride ? "Certified $70 applied." : "Default $35 is on this ticket."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mini-button${storageLienOverride ? " is-active" : ""}`}
                        onClick={() => setStorageLienOverride((prev) => !prev)}
                      >
                        Lien processed
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="calculator-actions">
                  <button type="button" className="ghost-button" onClick={handleStorageClear}>
                    Clear contents
                  </button>
                  <button type="button" className="primary-button" onClick={handleStorageCalculate}>
                    Calculate
                  </button>
                </div>
              </div>
            </section>

            <section className="detail-card calculator-card">
              <h2>Complete Breakdown</h2>
              <div className="detail-block">
                <div className="detail-row">
                  <span>Tow fee</span>
                  <span>{towFeeAmount == null ? "--" : formatCurrency(towFeeAmount)}</span>
                </div>
                <div className="detail-row">
                  <span>Total storage fee</span>
                  <span>
                    {storageCalc.storageTotal == null
                      ? "--"
                      : formatCurrency(storageCalc.storageTotal)}
                  </span>
                </div>
                {storageIsLienApplied ? (
                  <div className="detail-row">
                    <span>Lien fee</span>
                    <span>
                      {storageCalc.lienFee == null ? "--" : formatCurrency(storageCalc.lienFee)}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="detail-row calculator-total">
                <span>Total due</span>
                <span>
                  {storageCalc.grandTotal == null ? "--" : formatCurrency(storageCalc.grandTotal)}
                </span>
              </div>
            </section>
          </>
        ) : null}

        {activeCalculatorId === "towing" ? (
          <section className="detail-card calculator-card">
            <h2>Towing Rates Calculator</h2>
            <p className="content-subtitle">Agency-based rate setup.</p>
            <div className="form-row">
              <label className="form-field">
                Agency
                <select
                  value={towingAgency}
                  onChange={(event) => {
                    setTowingAgency(event.target.value);
                    setTowingLienOverride(false);
                    setChpLienOverride(false);
                    setSdLienOverride(false);
                    setCvpdLienOverride(false);
                    setSheriffLienOverride(false);
                    resetTowingCalc(true);
                  }}
                >
                  <option value="" disabled>
                    Select agency
                  </option>
                  <option value="fish_wildlife">Fish &amp; Wildlife</option>
                  <option value="san_diego">San Diego</option>
                  <option value="chp">CHP</option>
                  <option value="cvpd">CVPD</option>
                  <option value="sheriff">Sheriff</option>
                </select>
              </label>
            </div>

            {towingAgency === "fish_wildlife" ? (
              <div className="calculator-grid">
                <div className="form-row">
                  <label className="form-field">
                    Tow fee
                    <input type="text" readOnly value={formatCurrency(FISH_WILDLIFE_TOW_FEE)} />
                  </label>
                  <label className="form-field">
                    Storage fee per day
                    <input type="text" readOnly value={formatCurrency(FISH_WILDLIFE_STORAGE_DAILY)} />
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Date in
                    <input
                      type="date"
                      value={towingDateIn}
                      onChange={(event) => {
                        setTowingDateIn(event.target.value);
                        resetTowingCalc(true);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    Date out
                    <input
                      type="date"
                      value={towingDateOut}
                      onChange={(event) => {
                        setTowingDateOut(event.target.value);
                        resetTowingCalc(true);
                      }}
                    />
                  </label>
                </div>
                {towingDateInvalid ? (
                  <div className="form-error">Date out must be the same day or after date in.</div>
                ) : null}

                <div className="form-row">
                  <label className="form-field">
                    Gate fee
                    <div className="gate-fee-stack">
                      <button
                        type="button"
                        className={`mini-button gate-fee-button${towingGateFee ? " is-active" : ""}`}
                        onClick={() => {
                          setTowingGateFee((prev) => !prev);
                          resetTowingCalc(true);
                        }}
                      >
                        {towingGateFee ? "Added $105" : "Add gate fee"}
                      </button>
                      <span className="gate-fee-note">After 5pm or weekends</span>
                    </div>
                  </label>
                </div>
                {towingCalcError ? <div className="form-error">{towingCalcError}</div> : null}

                <div className="form-row">
                  <label className="form-field">
                    Total days in storage
                    <input
                      type="text"
                      readOnly
                      value={towingCalc.days == null ? "--" : String(towingCalc.days)}
                    />
                  </label>
                  <label className="form-field">
                    Total storage fee
                    <input
                      type="text"
                      readOnly
                      value={
                        towingCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(towingCalc.storageTotal)
                      }
                    />
                  </label>
                </div>

                {towingIsLienApplied ? (
                  <div className="calculator-lien">
                    <div className="calculator-lien-header">
                      <div>
                        <p className="content-subtitle">Lien fee applied</p>
                        <div className="calculator-lien-note">
                          {towingLienOverride ? "Certified $70 applied." : "Default $35 is on this ticket."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mini-button${towingLienOverride ? " is-active" : ""}`}
                        onClick={() => setTowingLienOverride((prev) => !prev)}
                      >
                        Lien processed
                      </button>
                    </div>
                  </div>
                ) : null}

                <section className="detail-card">
                  <h3>Breakdown</h3>
                  <div className="detail-block">
                    <div className="detail-row">
                      <span>Tow fee</span>
                      <span>
                        {towingCalc.towFee == null
                          ? "--"
                          : formatCurrency(towingCalc.towFee)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Storage fee</span>
                      <span>
                        {towingCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(towingCalc.storageTotal)}
                      </span>
                    </div>
                    {towingCalc.lienFee != null ? (
                      <div className="detail-row">
                        <span>Lien fee</span>
                        <span>{formatCurrency(towingCalc.lienFee)}</span>
                      </div>
                    ) : null}
                    {towingCalc.gateFee != null ? (
                      <div className="detail-row">
                        <span>Gate fee</span>
                        <span>{formatCurrency(towingCalc.gateFee)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="detail-row calculator-total">
                    <span>Total amount owed</span>
                    <span>
                      {towingCalc.total == null ? "--" : formatCurrency(towingCalc.total)}
                    </span>
                  </div>
                  <div className="calculator-actions left">
                    <button type="button" className="ghost-button" onClick={handleTowingClearAll}>
                      Clear contents
                    </button>
                  </div>
                </section>

                <div className="calculator-actions">
                  <button type="button" className="primary-button" onClick={handleTowingCalculate}>
                    Calculate
                  </button>
                </div>
              </div>
            ) : null}

            {towingAgency === "chp" ? (
              <div className="calculator-grid">
                <div className="form-row">
                  <label className="form-field">
                    Class
                    <select
                      value={chpClass}
                      onChange={(event) => {
                        setChpClass(event.target.value);
                        setChpStorageType("");
                        resetChpCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select class
                      </option>
                      <option value="class_a">Class A ($305 / hour)</option>
                      <option value="class_b">Class B ($335 / hour)</option>
                      <option value="class_c">Class C ($401 / hour)</option>
                      <option value="class_d">Class D Heavy ($420 / hour)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Tow fee
                    <input
                      type="text"
                      readOnly
                      value={
                        chpClass
                          ? formatCurrency(
                              chpClass === "class_a"
                                ? 305
                                : chpClass === "class_b"
                                  ? 335
                                  : chpClass === "class_c"
                                    ? 401
                                    : 420
                            )
                          : "--"
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Storage type
                    <select
                      value={chpStorageType}
                      onChange={(event) => {
                        setChpStorageType(event.target.value);
                        resetChpCalc(true);
                      }}
                      disabled={!chpClass}
                    >
                      <option value="" disabled>
                        Select storage type
                      </option>
                      {chpClass === "class_a" ? (
                        <>
                          <option value="class_a_inside">Inside storage ($77 / day)</option>
                          <option value="class_a_outside">Outside storage ($83 / day)</option>
                        </>
                      ) : null}
                      {chpClass === "class_b" ? (
                        <option value="class_b_inside">Inside storage ($88 / day)</option>
                      ) : null}
                      {chpClass === "class_c" ? (
                        <option value="class_c_outside">Outside storage ($99 / day)</option>
                      ) : null}
                      {chpClass === "class_d" ? (
                        <option value="class_d_outside">Outside storage ($110 / day)</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="form-field">
                    Gate fee
                    <div className="gate-fee-stack">
                      <button
                        type="button"
                        className={`mini-button gate-fee-button${chpGateFee ? " is-active" : ""}`}
                        onClick={() => {
                          setChpGateFee((prev) => !prev);
                          resetChpCalc(true);
                        }}
                      >
                        {chpGateFee ? "Added $132" : "Add gate fee"}
                      </button>
                    </div>
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Date in
                    <input
                      type="date"
                      value={chpDateIn}
                      onChange={(event) => {
                        setChpDateIn(event.target.value);
                        resetChpCalc(true);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    Date out
                    <input
                      type="date"
                      value={chpDateOut}
                      onChange={(event) => {
                        setChpDateOut(event.target.value);
                        resetChpCalc(true);
                      }}
                    />
                  </label>
                </div>
                {chpDateInvalid ? (
                  <div className="form-error">Date out must be the same day or after date in.</div>
                ) : null}
                {chpCalcError ? <div className="form-error">{chpCalcError}</div> : null}

                <div className="form-row">
                  <label className="form-field">
                    Total days in storage
                    <input
                      type="text"
                      readOnly
                      value={chpCalc.days == null ? "--" : String(chpCalc.days)}
                    />
                  </label>
                  <label className="form-field">
                    Total storage fee
                    <input
                      type="text"
                      readOnly
                      value={chpCalc.storageTotal == null ? "--" : formatCurrency(chpCalc.storageTotal)}
                    />
                  </label>
                </div>

                {chpIsLienApplied ? (
                  <div className="calculator-lien">
                    <div className="calculator-lien-header">
                      <div>
                        <p className="content-subtitle">Lien fee applied</p>
                        <div className="calculator-lien-note">
                          {chpLienOverride ? "Certified $70 applied." : "Default $35 is on this ticket."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mini-button${chpLienOverride ? " is-active" : ""}`}
                        onClick={() => setChpLienOverride((prev) => !prev)}
                      >
                        Lien processed
                      </button>
                    </div>
                  </div>
                ) : null}

                <section className="detail-card">
                  <h3>Breakdown</h3>
                  <div className="detail-block">
                    <div className="detail-row">
                      <span>Tow total</span>
                      <span>
                        {chpCalc.towTotal == null ? "--" : formatCurrency(chpCalc.towTotal)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Storage fee</span>
                      <span>
                        {chpCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(chpCalc.storageTotal)}
                      </span>
                    </div>
                    {chpCalc.lienFee != null ? (
                      <div className="detail-row">
                        <span>Lien fee</span>
                        <span>{formatCurrency(chpCalc.lienFee)}</span>
                      </div>
                    ) : null}
                    {chpCalc.gateFee != null ? (
                      <div className="detail-row">
                        <span>Gate fee</span>
                        <span>{formatCurrency(chpCalc.gateFee)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="detail-row calculator-total">
                    <span>Total amount owed</span>
                    <span>{chpCalc.total == null ? "--" : formatCurrency(chpCalc.total)}</span>
                  </div>
                  <div className="calculator-actions left">
                    <button type="button" className="ghost-button" onClick={handleTowingClearAll}>
                      Clear contents
                    </button>
                  </div>
                </section>

                <div className="calculator-actions">
                  <button type="button" className="primary-button" onClick={handleChpCalculate}>
                    Calculate
                  </button>
                </div>
              </div>
            ) : null}

            {towingAgency === "san_diego" ? (
              <div className="calculator-grid">
                <div className="form-row">
                  <label className="form-field">
                    Tow type
                    <select
                      value={sdTowType}
                      onChange={(event) => {
                        setSdTowType(event.target.value);
                        resetSdCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select tow type
                      </option>
                      <option value="regular">Regular tow ($243)</option>
                      <option value="medium">Medium tow ($356)</option>
                      <option value="heavy">Heavy tow ($424)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Tow fee
                    <input
                      type="text"
                      readOnly
                      value={
                        sdTowType
                          ? formatCurrency(
                              sdTowType === "regular"
                                ? SD_TOW_REGULAR
                                : sdTowType === "medium"
                                  ? SD_TOW_MEDIUM
                                  : SD_TOW_HEAVY
                            )
                          : "--"
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Storage type
                    <select
                      value={sdStorageType}
                      onChange={(event) => {
                        setSdStorageType(event.target.value);
                        resetSdCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select storage type
                      </option>
                      <option value="regular">Regular storage ($65 / day)</option>
                      <option value="medium">Medium storage ($98 / day)</option>
                      <option value="heavy">Heavy storage ($132 / day)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Flatbed / Dollies fee
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className={`mini-button${sdFlatbedFee ? " is-active" : ""}`}
                        onClick={() => {
                          setSdFlatbedFee((prev) => !prev);
                          resetSdCalc(true);
                        }}
                      >
                        {sdFlatbedFee ? "Added $47" : "Add $47"}
                      </button>
                    </div>
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Gate fee
                    <div className="gate-fee-stack">
                      <button
                        type="button"
                        className={`mini-button gate-fee-button${sdGateFee ? " is-active" : ""}`}
                        onClick={() => {
                          setSdGateFee((prev) => !prev);
                          resetSdCalc(true);
                        }}
                      >
                        {sdGateFee ? "Added $50" : "Add gate fee"}
                      </button>
                      <span className="gate-fee-note">After 5pm or weekends</span>
                    </div>
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Date in
                    <input
                      type="date"
                      value={sdDateIn}
                      onChange={(event) => {
                        setSdDateIn(event.target.value);
                        resetSdCalc(true);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    Date out
                    <input
                      type="date"
                      value={sdDateOut}
                      onChange={(event) => {
                        setSdDateOut(event.target.value);
                        resetSdCalc(true);
                      }}
                    />
                  </label>
                </div>
                {sdDateInvalid ? (
                  <div className="form-error">Date out must be the same day or after date in.</div>
                ) : null}
                {sdCalcError ? <div className="form-error">{sdCalcError}</div> : null}

                <div className="form-row">
                  <label className="form-field">
                    Total days in storage
                    <input
                      type="text"
                      readOnly
                      value={sdCalc.days == null ? "--" : String(sdCalc.days)}
                    />
                  </label>
                  <label className="form-field">
                    Total storage fee
                    <input
                      type="text"
                      readOnly
                      value={sdCalc.storageTotal == null ? "--" : formatCurrency(sdCalc.storageTotal)}
                    />
                  </label>
                </div>

                {sdIsLienApplied ? (
                  <div className="calculator-lien">
                    <div className="calculator-lien-header">
                      <div>
                        <p className="content-subtitle">Lien fee applied</p>
                        <div className="calculator-lien-note">
                          {sdLienOverride ? "Certified $70 applied." : "Default $35 is on this ticket."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mini-button${sdLienOverride ? " is-active" : ""}`}
                        onClick={() => setSdLienOverride((prev) => !prev)}
                      >
                        Lien processed
                      </button>
                    </div>
                  </div>
                ) : null}

                <section className="detail-card">
                  <h3>Breakdown</h3>
                  <div className="detail-block">
                    <div className="detail-row">
                      <span>Tow fee</span>
                      <span>{sdCalc.towFee == null ? "--" : formatCurrency(sdCalc.towFee)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Storage fee</span>
                      <span>
                        {sdCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(sdCalc.storageTotal)}
                      </span>
                    </div>
                    {sdCalc.lienFee != null ? (
                      <div className="detail-row">
                        <span>Lien fee</span>
                        <span>{formatCurrency(sdCalc.lienFee)}</span>
                      </div>
                    ) : null}
                    {sdCalc.flatbedFee != null ? (
                      <div className="detail-row">
                        <span>Flatbed / Dollies</span>
                        <span>{formatCurrency(sdCalc.flatbedFee)}</span>
                      </div>
                    ) : null}
                    {sdCalc.gateFee != null ? (
                      <div className="detail-row">
                        <span>Gate fee</span>
                        <span>{formatCurrency(sdCalc.gateFee)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="detail-row calculator-total">
                    <span>Total amount owed</span>
                    <span>{sdCalc.total == null ? "--" : formatCurrency(sdCalc.total)}</span>
                  </div>
                  <div className="calculator-actions left">
                    <button type="button" className="ghost-button" onClick={handleTowingClearAll}>
                      Clear contents
                    </button>
                  </div>
                </section>

                <div className="calculator-actions">
                  <button type="button" className="primary-button" onClick={handleSdCalculate}>
                    Calculate
                  </button>
                </div>
              </div>
            ) : null}

            {towingAgency === "cvpd" ? (
              <div className="calculator-grid">
                <div className="form-row">
                  <label className="form-field">
                    Tow type
                    <select
                      value={cvpdTowType}
                      onChange={(event) => {
                        setCvpdTowType(event.target.value);
                        resetCvpdCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select tow type
                      </option>
                      <option value="basic">Basic tow ($289)</option>
                      <option value="medium">Medium tow ($324)</option>
                      <option value="heavy">Heavy tow ($374)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Tow fee
                    <input
                      type="text"
                      readOnly
                      value={
                        cvpdTowType
                          ? formatCurrency(
                              cvpdTowType === "basic"
                                ? CVPD_TOW_BASIC
                                : cvpdTowType === "medium"
                                  ? CVPD_TOW_MEDIUM
                                  : CVPD_TOW_HEAVY
                            )
                          : "--"
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Storage type
                    <select
                      value={cvpdStorageType}
                      onChange={(event) => {
                        setCvpdStorageType(event.target.value);
                        resetCvpdCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select storage type
                      </option>
                      <option value="basic">Basic storage ($74 / day)</option>
                      <option value="medium">Medium storage ($83 / day)</option>
                      <option value="heavy">Heavy storage ($92 / day)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Gate fee
                    <div className="gate-fee-stack">
                      <button
                        type="button"
                        className={`mini-button gate-fee-button${cvpdGateFee ? " is-active" : ""}`}
                        onClick={() => {
                          setCvpdGateFee((prev) => !prev);
                          resetCvpdCalc(true);
                        }}
                      >
                        {cvpdGateFee ? "Added $65" : "Add gate fee"}
                      </button>
                      <span className="gate-fee-note">After 5pm or weekends</span>
                    </div>
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Date in
                    <input
                      type="date"
                      value={cvpdDateIn}
                      onChange={(event) => {
                        setCvpdDateIn(event.target.value);
                        resetCvpdCalc(true);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    Date out
                    <input
                      type="date"
                      value={cvpdDateOut}
                      onChange={(event) => {
                        setCvpdDateOut(event.target.value);
                        resetCvpdCalc(true);
                      }}
                    />
                  </label>
                </div>
                {cvpdDateInvalid ? (
                  <div className="form-error">Date out must be the same day or after date in.</div>
                ) : null}

                <div className="form-row">
                  <label className="form-field">
                    Labor hours
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={cvpdLaborHours}
                      onChange={(event) => {
                        setCvpdLaborHours(event.target.value);
                        resetCvpdCalc(true);
                      }}
                      placeholder="0"
                    />
                  </label>
                  <label className="form-field">
                    Labor minutes
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      value={cvpdLaborMinutes}
                      onChange={(event) => {
                        setCvpdLaborMinutes(event.target.value);
                        resetCvpdCalc(true);
                      }}
                      placeholder="0"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-field">
                    Negligence fee
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className={`mini-button${cvpdNegligenceFee ? " is-active" : ""}`}
                        onClick={() => {
                          setCvpdNegligenceFee((prev) => !prev);
                          resetCvpdCalc(true);
                        }}
                      >
                        {cvpdNegligenceFee ? "Added $175" : "Add negligence fee"}
                      </button>
                    </div>
                  </label>
                </div>
                <div className="content-subtitle">
                  Labor is ${CVPD_LABOR_RATE} per hour after the first hour.
                </div>
                {cvpdCalcError ? <div className="form-error">{cvpdCalcError}</div> : null}

                <div className="form-row">
                  <label className="form-field">
                    Total days in storage
                    <input
                      type="text"
                      readOnly
                      value={cvpdCalc.days == null ? "--" : String(cvpdCalc.days)}
                    />
                  </label>
                  <label className="form-field">
                    Total storage fee
                    <input
                      type="text"
                      readOnly
                      value={
                        cvpdCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(cvpdCalc.storageTotal)
                      }
                    />
                  </label>
                </div>

                {cvpdIsLienApplied ? (
                  <div className="calculator-lien">
                    <div className="calculator-lien-header">
                      <div>
                        <p className="content-subtitle">Lien fee applied</p>
                        <div className="calculator-lien-note">
                          {cvpdLienOverride ? "Certified $70 applied." : "Default $35 is on this ticket."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mini-button${cvpdLienOverride ? " is-active" : ""}`}
                        onClick={() => setCvpdLienOverride((prev) => !prev)}
                      >
                        Lien processed
                      </button>
                    </div>
                  </div>
                ) : null}

                <section className="detail-card">
                  <h3>Breakdown</h3>
                  <div className="detail-block">
                    <div className="detail-row">
                      <span>Tow fee</span>
                      <span>{cvpdCalc.towFee == null ? "--" : formatCurrency(cvpdCalc.towFee)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Storage fee</span>
                      <span>
                        {cvpdCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(cvpdCalc.storageTotal)}
                      </span>
                    </div>
                    {cvpdCalc.lienFee != null ? (
                      <div className="detail-row">
                        <span>Lien fee</span>
                        <span>{formatCurrency(cvpdCalc.lienFee)}</span>
                      </div>
                    ) : null}
                    <div className="detail-row">
                      <span>Labor fee</span>
                      <span>
                        {cvpdCalc.laborFee == null ? "--" : formatCurrency(cvpdCalc.laborFee)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Negligence fee</span>
                      <span>
                        {cvpdCalc.negligenceFee == null
                          ? "--"
                          : formatCurrency(cvpdCalc.negligenceFee)}
                      </span>
                    </div>
                    {cvpdCalc.gateFee != null ? (
                      <div className="detail-row">
                        <span>Gate fee</span>
                        <span>{formatCurrency(cvpdCalc.gateFee)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="detail-row calculator-total">
                    <span>Total amount owed</span>
                    <span>{cvpdCalc.total == null ? "--" : formatCurrency(cvpdCalc.total)}</span>
                  </div>
                  <div className="calculator-actions left">
                    <button type="button" className="ghost-button" onClick={handleTowingClearAll}>
                      Clear contents
                    </button>
                  </div>
                </section>

                <div className="calculator-actions">
                  <button type="button" className="primary-button" onClick={handleCvpdCalculate}>
                    Calculate
                  </button>
                </div>
              </div>
            ) : null}

            {towingAgency === "sheriff" ? (
              <div className="calculator-grid">
                <div className="form-row">
                  <label className="form-field">
                    Tow type
                    <select
                      value={sheriffTowType}
                      onChange={(event) => {
                        setSheriffTowType(event.target.value);
                        resetSheriffCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select tow type
                      </option>
                      <option value="regular">Regular tow ($204)</option>
                      <option value="medium">Medium tow ($231)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Tow fee
                    <input
                      type="text"
                      readOnly
                      value={
                        sheriffTowType
                          ? formatCurrency(
                              sheriffTowType === "regular"
                                ? SHERIFF_TOW_REGULAR
                                : SHERIFF_TOW_MEDIUM
                            )
                          : "--"
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Storage type
                    <select
                      value={sheriffStorageType}
                      onChange={(event) => {
                        setSheriffStorageType(event.target.value);
                        resetSheriffCalc(true);
                      }}
                    >
                      <option value="" disabled>
                        Select storage type
                      </option>
                      <option value="regular">Regular storage ($44 / day)</option>
                      <option value="medium">Medium storage ($55 / day)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    Gate fee
                    <div className="gate-fee-stack">
                      <button
                        type="button"
                        className={`mini-button gate-fee-button${sheriffGateFee ? " is-active" : ""}`}
                        onClick={() => {
                          setSheriffGateFee((prev) => !prev);
                          resetSheriffCalc(true);
                        }}
                      >
                        {sheriffGateFee ? "Added $102" : "Add gate fee"}
                      </button>
                      <span className="gate-fee-note">After 5pm or weekends</span>
                    </div>
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-field">
                    Date in
                    <input
                      type="date"
                      value={sheriffDateIn}
                      onChange={(event) => {
                        setSheriffDateIn(event.target.value);
                        resetSheriffCalc(true);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    Date out
                    <input
                      type="date"
                      value={sheriffDateOut}
                      onChange={(event) => {
                        setSheriffDateOut(event.target.value);
                        resetSheriffCalc(true);
                      }}
                    />
                  </label>
                </div>
                {sheriffDateInvalid ? (
                  <div className="form-error">Date out must be the same day or after date in.</div>
                ) : null}
                {sheriffCalcError ? <div className="form-error">{sheriffCalcError}</div> : null}

                <div className="form-row">
                  <label className="form-field">
                    Total days in storage
                    <input
                      type="text"
                      readOnly
                      value={sheriffCalc.days == null ? "--" : String(sheriffCalc.days)}
                    />
                  </label>
                  <label className="form-field">
                    Total storage fee
                    <input
                      type="text"
                      readOnly
                      value={
                        sheriffCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(sheriffCalc.storageTotal)
                      }
                    />
                  </label>
                </div>

                {sheriffIsLienApplied ? (
                  <div className="calculator-lien">
                    <div className="calculator-lien-header">
                      <div>
                        <p className="content-subtitle">Lien fee applied</p>
                        <div className="calculator-lien-note">
                          {sheriffLienOverride ? "Certified $70 applied." : "Default $35 is on this ticket."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`mini-button${sheriffLienOverride ? " is-active" : ""}`}
                        onClick={() => setSheriffLienOverride((prev) => !prev)}
                      >
                        Lien processed
                      </button>
                    </div>
                  </div>
                ) : null}

                <section className="detail-card">
                  <h3>Breakdown</h3>
                  <div className="detail-block">
                    <div className="detail-row">
                      <span>Tow fee</span>
                      <span>
                        {sheriffCalc.towFee == null ? "--" : formatCurrency(sheriffCalc.towFee)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Storage fee</span>
                      <span>
                        {sheriffCalc.storageTotal == null
                          ? "--"
                          : formatCurrency(sheriffCalc.storageTotal)}
                      </span>
                    </div>
                    {sheriffCalc.lienFee != null ? (
                      <div className="detail-row">
                        <span>Lien fee</span>
                        <span>{formatCurrency(sheriffCalc.lienFee)}</span>
                      </div>
                    ) : null}
                    <div className="detail-row">
                      <span>Sheriff fee</span>
                      <span>
                        {sheriffCalc.sheriffFee == null
                          ? "--"
                          : formatCurrency(sheriffCalc.sheriffFee)}
                      </span>
                    </div>
                    {sheriffCalc.gateFee != null ? (
                      <div className="detail-row">
                        <span>Gate fee</span>
                        <span>{formatCurrency(sheriffCalc.gateFee)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="detail-row calculator-total">
                    <span>Total amount owed</span>
                    <span>
                      {sheriffCalc.total == null ? "--" : formatCurrency(sheriffCalc.total)}
                    </span>
                  </div>
                  <div className="calculator-actions left">
                    <button type="button" className="ghost-button" onClick={handleTowingClearAll}>
                      Clear contents
                    </button>
                  </div>
                </section>

                <div className="calculator-actions">
                  <button type="button" className="primary-button" onClick={handleSheriffCalculate}>
                    Calculate
                  </button>
                </div>
              </div>
            ) : null}

            {!["fish_wildlife", "chp", "san_diego", "cvpd", "sheriff"].includes(towingAgency) ? (
              <div className="content-subtitle">Select an agency to load its rate rules.</div>
            ) : null}
          </section>
        ) : null}

        {activeCalculatorId === "over-miles" ? (
          <section className="detail-card calculator-card">
            <h2>Over Miles Calculator</h2>
            <p className="content-subtitle">Calculate over-mile charges based on membership coverage.</p>

            <div className="calculator-selector">
              <button
                className={`ghost-button${overMilesMode === "existing" ? " is-active" : ""}`}
                onClick={() => {
                  setOverMilesMode("existing");
                  if (!overMilesCallId && overMilesCallOptions.length > 0) {
                    setOverMilesCallId(overMilesCallOptions[0].call_id);
                  }
                  window.setTimeout(() => {
                    overMilesCallSelectRef.current?.focus();
                  }, 0);
                }}
              >
                Upload Existing Call
              </button>
              <button
                className={`ghost-button${overMilesMode === "manual" ? " is-active" : ""}`}
                onClick={() => setOverMilesMode("manual")}
              >
                Manual Entry
              </button>
            </div>

            <div className="calculator-grid">
              {overMilesMode === "existing" ? (
                <label className="form-field">
                  Call #
                  <select
                    ref={overMilesCallSelectRef}
                    value={overMilesCallId}
                    onChange={(event) => {
                      setOverMilesCallId(event.target.value);
                      setOverMilesError(null);
                    }}
                  >
                    <option value="" disabled>
                      Select a call
                    </option>
                    {overMilesCallOptions.map((call) => (
                      <option key={call.call_id} value={call.call_id}>
                        {(call.external_call_number ?? call.call_id)} •{" "}
                        {new Date(call.status_updated_at).toLocaleString("en-US", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="form-row">
                <label className="form-field">
                  Pickup address
                  <input
                    type="text"
                    value={overMilesPickup}
                    onChange={(event) => {
                      setOverMilesPickup(event.target.value);
                      setOverMilesError(null);
                    }}
                    placeholder="Pickup address"
                  />
                </label>
                <label className="form-field">
                  Dropoff address
                  <input
                    type="text"
                    value={overMilesDropoff}
                    onChange={(event) => {
                      setOverMilesDropoff(event.target.value);
                      setOverMilesError(null);
                    }}
                    placeholder="Dropoff address"
                  />
                </label>
              </div>

              <label className="form-field">
                Membership level
                <select
                  value={overMilesMembership}
                  onChange={(event) => {
                    setOverMilesMembership(event.target.value);
                    setOverMilesError(null);
                  }}
                >
                  <option value="" disabled>
                    Select membership
                  </option>
                  <option value="classic">Classic (7 miles)</option>
                  <option value="plus">Plus (100 miles)</option>
                  <option value="premier">Premier (200 miles)</option>
                  <option value="none">No coverage</option>
                </select>
              </label>

              {overMilesError ? <div className="form-error">{overMilesError}</div> : null}

              <div className="form-row">
                <label className="form-field">
                  Total tow miles
                  <input
                    type="text"
                    readOnly
                    value={
                      overMilesRounded == null
                        ? "--"
                        : `${overMilesRounded} mi`
                    }
                  />
                </label>
                <label className="form-field">
                  Total over miles
                  <input
                    type="text"
                    readOnly
                    value={overMilesTotal == null ? "--" : String(overMilesTotal)}
                  />
                </label>
              </div>

              <div className="form-row">
                <label className="form-field">
                  Total over miles cost
                  <input
                    type="text"
                    readOnly
                    value={
                      overMilesCalcCost == null ? "--" : formatCurrency(overMilesCalcCost)
                    }
                  />
                </label>
              </div>

              <div className="calculator-actions">
                <button type="button" className="ghost-button" onClick={handleOverMilesClear}>
                  Clear contents
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleOverMilesCalculate}
                  disabled={overMilesLoading}
                >
                  {overMilesLoading ? "Calculating…" : "Calculate"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </>
    );
  } else if (activeTabId === "daily-report") {
    const today = new Date(nowMs);
    const todayKey = dateKey(today);
    const dailyDriverIds = new Set(dailyReportItems.map((item) => item.driver_id));
    const driversWithCalls = scheduleDrivers.filter((driver) => dailyDriverIds.has(driver.id));
    const unknownDriverIds = Array.from(dailyDriverIds).filter(
      (id) => !scheduleDrivers.some((driver) => driver.id === id)
    );
    const allDriversForReport = [
      ...driversWithCalls.map((driver) => ({ id: driver.id, name: driver.display_name })),
      ...unknownDriverIds.map((id) => ({ id, name: `Driver ${id.slice(0, 6)}` })),
    ];
    const codPpiCalls = dailyReportItems.filter(
      (item) => item.source_type === "COD" || item.source_type === "PPI"
    );
    const lawCalls = dailyReportItems.filter((item) => item.source_type === "LAW_ENFORCEMENT");

    contentBody = (
      <>
        <div className="hero-card">
          <p className="hero-label">Daily Report</p>
          <p className="hero-sub">Today's completed calls</p>
          <div className="hero-status">
            {dailyReportLoading
              ? "Loading daily report..."
              : dailyReportError
                ? dailyReportError
                : `${dailyReportItems.length} completed calls`}
          </div>
        </div>

        <section className="detail-card">
          <h2>Drivers Completed Calls</h2>
          {dailyReportLoading ? (
            <div className="driver-empty">Loading drivers...</div>
          ) : dailyReportError ? (
            <div className="driver-empty">{dailyReportError}</div>
          ) : allDriversForReport.length === 0 ? (
            <div className="driver-empty">No completed calls yet today.</div>
          ) : (
            <div className="driver-grid">
              {allDriversForReport.map((driver) => {
                const todayShift = scheduleShiftLookup.get(`${driver.id}-${todayKey}`);
                const dashboardDriver = dashboardDrivers.find((item) => item.driver_id === driver.id);
                return (
                  <article key={driver.id} className="driver-card detail-card">
                    <div className="driver-card-header">
                      <div>
                        <h3>{driver.name}</h3>
                        <span className="driver-sub">Driver summary</span>
                      </div>
                    </div>
                    <div className="driver-meta-row">
                      <span>Truck #</span>
                      <span className="driver-meta-value">
                        {dashboardDriver?.current_truck?.truck_number ?? "--"}
                      </span>
                    </div>
                    <div className="driver-meta-row">
                      <span>Shift Time</span>
                      <span className="driver-meta-value">
                        {todayShift
                          ? formatIsoRange(todayShift.shift_start, todayShift.shift_end)
                          : "--"}
                      </span>
                    </div>
                    <div className="driver-meta-row">
                      <span>Lunch Start - End</span>
                      <span className="driver-meta-value">
                        {todayShift
                          ? formatIsoRange(todayShift.lunch_start, todayShift.lunch_end)
                          : "--"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="detail-card">
          <h2>COD / PPI Calls</h2>
          {dailyReportLoading ? (
            <div className="driver-empty">Loading COD/PPI calls...</div>
          ) : codPpiCalls.length === 0 ? (
            <div className="driver-empty">No COD or PPI calls completed today.</div>
          ) : (
            <div className="driver-grid">
              {allDriversForReport.map((driver) => {
                const driverCalls = codPpiCalls.filter((item) => item.driver_id === driver.id);
                if (driverCalls.length === 0) return null;
                return (
                  <article key={driver.id} className="driver-card detail-card">
                    <div className="driver-card-header">
                      <div>
                        <h3>{driver.name}</h3>
                        <span className="driver-sub">COD / PPI completed</span>
                      </div>
                      <span className="driver-index">{driverCalls.length}</span>
                    </div>
                    <div className="call-report-list">
                      {driverCalls.map((item) => {
                        const detail = dailyReportDetails[item.call_id]?.call;
                        const serviceType =
                          extractNoteValue(detail?.notes, "Service Type") ??
                          extractNoteValue(detail?.pickup_notes, "Service Type") ??
                          "--";
                        const serviceCharge =
                          item.source_type === "COD"
                            ? typeof detail?.pricing_total === "number"
                              ? formatCurrency(detail.pricing_total)
                              : extractNoteValue(detail?.pricing_notes, "Service Charge")
                            : "--";
                        const paymentType = extractNoteValue(detail?.notes, "Payment Type") ?? "--";
                        const amountPaid = extractNoteValue(detail?.notes, "Amount Paid") ?? "--";
                        return (
                          <div key={item.call_id} className="call-report-item">
                            <div className="call-report-main">
                              <span className="call-report-type">{item.source_type}</span>
                              <span className="call-report-time">{formatIsoTime(detail?.closed_at)}</span>
                            </div>
                            <div className="call-report-meta">
                              <span>Car: {detail?.vehicle_description ?? "--"}</span>
                              <span>Service: {serviceType}</span>
                              <span>Charge: {serviceCharge ?? "--"}</span>
                              <span>Payment: {paymentType}</span>
                              <span>Amount Paid: {amountPaid}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="detail-card">
          <h2>Law Enforcement Calls</h2>
          {dailyReportLoading ? (
            <div className="driver-empty">Loading law enforcement calls...</div>
          ) : lawCalls.length === 0 ? (
            <div className="driver-empty">No law enforcement calls completed today.</div>
          ) : (
            <div className="driver-grid">
              {allDriversForReport.map((driver) => {
                const driverCalls = lawCalls.filter((item) => item.driver_id === driver.id);
                if (driverCalls.length === 0) return null;
                return (
                  <article key={driver.id} className="driver-card detail-card">
                    <div className="driver-card-header">
                      <div>
                        <h3>{driver.name}</h3>
                        <span className="driver-sub">Law enforcement completed</span>
                      </div>
                      <span className="driver-index">{driverCalls.length}</span>
                    </div>
                    <div className="call-report-list">
                      {driverCalls.map((item) => {
                        const detail = dailyReportDetails[item.call_id]?.call;
                        return (
                          <div key={item.call_id} className="call-report-item">
                            <div className="call-report-main">
                              <span className="call-report-type">
                                {detail?.law_agency ?? "Law Enforcement"}
                              </span>
                              <span className="call-report-time">{formatIsoTime(detail?.closed_at)}</span>
                            </div>
                            <div className="call-report-meta">
                              <span>Log #: {detail?.external_call_number ?? "--"}</span>
                              <span>Location: {detail?.pickup_address ?? "--"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="detail-card">
          <h2>AAA Members Log</h2>
          {aaaCallsLoading ? (
            <div className="driver-empty">Loading AAA calls…</div>
          ) : aaaCallsError ? (
            <div className="driver-empty">{aaaCallsError}</div>
          ) : aaaCalls.length === 0 ? (
            <div className="driver-empty">No AAA calls yet.</div>
          ) : (
            <div className="aaa-table-wrap">
              <table className="aaa-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Call #</th>
                    <th>Contact ID</th>
                    <th>Phone Number</th>
                    <th>Called Member?</th>
                    <th>Time Stamp</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {aaaCalls.map((call) => {
                    const rows = aaaMemberRows[call.call_id] ?? [];
                    if (rows.length === 0) return null;
                    const driverName =
                      call.driver_name ?? aaaDriverByCallId.get(call.call_id) ?? "--";
    const contactId =
      (call.contact_id ?? extractContactId(call.notes, call.pricing_notes, call.pickup_notes)) || "--";
                    const phone = call.callback_phone ?? "--";
                    const callNumber = call.external_call_number ?? "--";
                    return rows.map((row, index) => (
                      <tr key={row.id}>
                        {index === 0 ? (
                          <>
                            <td rowSpan={rows.length}>{driverName}</td>
                            <td rowSpan={rows.length}>{callNumber}</td>
                            <td rowSpan={rows.length}>{contactId}</td>
                            <td rowSpan={rows.length}>{phone}</td>
                          </>
                        ) : null}
                        <td>
                          <input
                            type="checkbox"
                            checked={row.calledMember}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              handleAaaRowUpdate(call.call_id, row.id, {
                                calledMember: checked,
                                timestamp: checked
                                  ? new Date().toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })
                                  : null,
                              });
                            }}
                          />
                        </td>
                        <td>{row.timestamp ?? "--"}</td>
                        <td>
                          <input
                            type="text"
                            maxLength={1000}
                            value={row.notes}
                            onChange={(event) => {
                              handleAaaRowUpdate(call.call_id, row.id, {
                                notes: sanitizeAlphanumeric(event.target.value).slice(0, 1000),
                              });
                            }}
                            placeholder="Notes"
                            className="aaa-notes-input"
                          />
                        </td>
                        {index === 0 ? (
                          <td rowSpan={rows.length}>
                            <button
                              type="button"
                              className="mini-button aaa-add-row"
                              onClick={() => handleAaaAddRow(call.call_id)}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="mini-button aaa-remove-row"
                              onClick={() => handleAaaRemoveRow(call.call_id)}
                              disabled={rows.length <= 1}
                              title={rows.length <= 1 ? "Cannot remove last row" : "Remove last row"}
                            >
                              −
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="detail-card">
          <h2>Daily Notes</h2>
          <label className="form-field detail-row-wide">
            Notes
            <textarea
              value={dailyReportNotes}
              onChange={(event) => setDailyReportNotes(event.target.value)}
              placeholder="Add notes for today..."
            />
          </label>
        </section>
      </>
    );
  } else if (activeTabId === "history") {
    contentBody = (
      <>
        <div className="hero-card">
          <p className="hero-label">Call History</p>
          <p className="hero-sub">Search completed and cancelled calls</p>
        </div>

        <section className="driver-section">
          <div className="history-filters">
            <input
              className="history-search-input"
              type="text"
              placeholder="Search by address, contact, notes…"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
            <select
              className="history-filter-select"
              value={historySourceFilter}
              onChange={(event) => setHistorySourceFilter(event.target.value)}
            >
              <option value="">All sources</option>
              <option value="AAA">AAA</option>
              <option value="LAW_ENFORCEMENT">Law Enforcement</option>
              <option value="COD">COD</option>
              <option value="PPI">PPI</option>
            </select>
            <select
              className="history-filter-select"
              value={historyStatusFilter}
              onChange={(event) => setHistoryStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="98">98 (Completed)</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <input
              className="history-filter-date"
              type="date"
              value={historyDateFrom}
              onChange={(event) => setHistoryDateFrom(event.target.value)}
              title="From date"
            />
            <input
              className="history-filter-date"
              type="date"
              value={historyDateTo}
              onChange={(event) => setHistoryDateTo(event.target.value)}
              title="To date"
            />
            <button
              className="ghost-button"
              type="button"
              onClick={() => void loadCallHistory()}
            >
              Search
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setHistorySearch("");
                setHistorySourceFilter("");
                setHistoryStatusFilter("");
                setHistoryDateFrom("");
                setHistoryDateTo("");
              }}
            >
              Reset
            </button>
          </div>

          {historyLoading ? (
            <div className="driver-empty">Loading…</div>
          ) : historyError ? (
            <div className="driver-empty">{historyError}</div>
          ) : historyItems.length === 0 ? (
            <div className="driver-empty">No completed calls found. Try adjusting filters and searching.</div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Call #</th>
                    <th>Source</th>
                    <th>Agency</th>
                    <th>Pickup</th>
                    <th>Drop-off</th>
                    <th>Contact</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => (
                    <tr key={item.call_id}>
                      <td>{formatIsoTime(item.created_at)}</td>
                      <td>{item.external_call_number ?? "--"}</td>
                      <td>{item.source_type}</td>
                      <td>{item.law_agency ?? "--"}</td>
                      <td className="history-address">{item.pickup_address}</td>
                      <td className="history-address">{item.dropoff_address ?? "--"}</td>
                      <td>{item.contact_name ?? "--"}</td>
                      <td>{item.driver_name ?? "--"}</td>
                      <td>{item.status}</td>
                      <td>{item.outcome ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  } else if (activeTabId === "settings") {
    const eventTypes = [
      "CALL_CREATED",
      "CALL_UPDATED",
      "CALL_STATUS_CHANGED",
      "CALL_COMPLETED",
      "CALL_CANCELLED",
      "CALL_ASSIGNED",
      "CALL_QUEUE_MOVED",
      "CALL_UNASSIGNED",
      "CALL_ACTIVE_REASSIGNED",
      "DRIVER_STATUS_CHANGED",
    ];
    contentBody = (
      <>
        <div className="hero-card">
          <p className="hero-label">Settings</p>
          <p className="hero-sub">Panel preferences</p>
          <div className="hero-status">Window is resizable.</div>
        </div>

        <section className="detail-card">
          <h2>Panel position</h2>
          <p className="content-subtitle">
            Choose which side of the screen the panel should dock to.
          </p>
          <div className="form-row">
            <button
              className={`ghost-button${panelSide === "left" ? " is-active" : ""}`}
              onClick={() => setPanelSide("left")}
            >
              Left side
            </button>
            <button
              className={`ghost-button${panelSide === "right" ? " is-active" : ""}`}
              onClick={() => setPanelSide("right")}
            >
              Right side
            </button>
          </div>
        </section>
        <section className="detail-card">
          <h2>Always on top</h2>
          <p className="content-subtitle">
            Keep DispatcherOne above other windows.
          </p>
          <div className="form-row">
            <button
              className={`ghost-button${alwaysOnTop ? " is-active" : ""}`}
              onClick={() => {
                setAlwaysOnTop(true);
                localStorage.setItem(ALWAYS_ON_TOP_KEY, "true");
              }}
            >
              On
            </button>
            <button
              className={`ghost-button${!alwaysOnTop ? " is-active" : ""}`}
              onClick={() => {
                setAlwaysOnTop(false);
                localStorage.setItem(ALWAYS_ON_TOP_KEY, "false");
              }}
            >
              Off
            </button>
          </div>
        </section>

        <section className="detail-card">
          <h2>Priority groups</h2>
          <p className="content-subtitle">
            Default priority group used when new calls are created.
          </p>
          {priorityLoading ? (
            <div className="driver-empty">Loading priority settings...</div>
          ) : (
            <div className="detail-grid-rows">
              {[
                { label: "LAW_ENFORCEMENT", key: "priority.group.LAW_ENFORCEMENT" },
                { label: "AAA", key: "priority.group.AAA" },
                { label: "PPI", key: "priority.group.PPI" },
                { label: "COD", key: "priority.group.COD" },
              ].map((item) => (
                <label key={item.key} className="form-field">
                  {item.label}
                  <select
                    value={prioritySettings[item.key] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPrioritySettings((prev) => ({ ...prev, [item.key]: value }));
                      void invoke("settings_set", { key: item.key, value });
                    }}
                  >
                    <option value="">Default</option>
                    <option value="LAW_ENFORCEMENT">LAW_ENFORCEMENT</option>
                    <option value="AAA">AAA</option>
                    <option value="PPI_COD">PPI_COD</option>
                  </select>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="detail-card">
          <h2>MapQuest Test Mode</h2>
          <p className="content-subtitle">
            When enabled, geocoding and distance calls still require explicit button clicks.
          </p>
          <div className="form-row">
            <button
              className={`ghost-button${geocodeTestMode ? " is-active" : ""}`}
              onClick={() => {
                setGeocodeTestMode(true);
                void invoke("settings_set", { key: "geocode.test_mode", value: "true" });
              }}
            >
              On
            </button>
            <button
              className={`ghost-button${!geocodeTestMode ? " is-active" : ""}`}
              onClick={() => {
                setGeocodeTestMode(false);
                void invoke("settings_set", { key: "geocode.test_mode", value: "false" });
              }}
            >
              Off
            </button>
          </div>
        </section>

        <section className="detail-card">
          <h2>Tesseract OCR</h2>
          <p className="content-subtitle">
            Optional custom path to tesseract.exe (useful on other PCs).
          </p>
          <label className="form-field detail-row-wide">
            Tesseract path
            <input
              type="text"
              value={tesseractPath}
              placeholder="C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
              onChange={(event) => {
                const value = event.target.value;
                setTesseractPath(value);
                void invoke("settings_set", { key: "tesseract.path", value });
              }}
            />
          </label>
        </section>

        <section className="detail-card">
          <h2>Tracking Server</h2>
          <p className="content-subtitle">
            Server URL and auth token used when generating customer tracking links.
          </p>
          <label className="form-field detail-row-wide">
            Server URL
            <input
              type="text"
              value={serverUrl}
              placeholder="http://localhost:8000"
              onChange={(event) => {
                const value = event.target.value;
                setServerUrl(value);
                void invoke("settings_set", { key: "server.url", value });
              }}
            />
          </label>
          <label className="form-field detail-row-wide">
            Auth Token
            <input
              type="password"
              value={serverAuthToken}
              placeholder="Paste token from /login"
              onChange={(event) => {
                const value = event.target.value;
                setServerAuthToken(value);
                void invoke("settings_set", { key: "server.auth_token", value });
              }}
            />
          </label>
        </section>

        <section className="detail-card">
          <h2>Event Log</h2>
          <div className="driver-section-actions">
            <label className="form-field">
              Search
              <input
                type="search"
                placeholder="Search events"
                value={eventLogSearch}
                onChange={(event) => setEventLogSearch(event.target.value)}
              />
            </label>
            <label className="form-field">
              Entity
              <select
                value={eventLogEntityType}
                onChange={(event) => setEventLogEntityType(event.target.value)}
              >
                <option value="">All</option>
                <option value="CALL">Call</option>
                <option value="DRIVER">Driver</option>
              </select>
            </label>
            <label className="form-field">
              Event
              <select
                value={eventLogEventType}
                onChange={(event) => setEventLogEventType(event.target.value)}
              >
                <option value="">All</option>
                {eventTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-field">
              <span>Actions</span>
              <button
                type="button"
                className="ghost-button"
                title={
                  eventLogLastCleared
                    ? `Last cleared: ${formatIsoTime(eventLogLastCleared)}`
                    : "Clear all event log entries"
                }
                onClick={async () => {
                  if (!isTauri) return;
                  if (!window.confirm("Clear all event log entries?")) return;
                  try {
                    setEventLogLoading(true);
                    await invoke("event_log_clear");
                    setEventLogItems([]);
                    const now = new Date().toISOString();
                    localStorage.setItem("event-log-last-clear", dateKey(new Date(nowMs)));
                    localStorage.setItem("event-log-last-clear-time", now);
                    setEventLogLastCleared(now);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    setEventLogError(message);
                  } finally {
                    setEventLogLoading(false);
                  }
                }}
              >
                Clear all
              </button>
            </div>
          </div>

          {eventLogLoading ? (
            <div className="driver-empty">Loading events…</div>
          ) : eventLogError ? (
            <div className="driver-empty">{eventLogError}</div>
          ) : eventLogItems.length === 0 ? (
            <div className="driver-empty">No events found.</div>
          ) : (
            <div className="aaa-table-wrap">
              <table className="aaa-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Event</th>
                    <th>Entity</th>
                    <th>Call #</th>
                    <th>Driver</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {eventLogItems.map((item) => (
                    <tr key={item.id}>
                      <td>{formatIsoTime(item.timestamp)}</td>
                      <td>
                        {item.event_type === "CALL_ASSIGNED"
                          ? "Assigned"
                          : item.event_type === "CALL_QUEUE_MOVED"
                            ? "Reassigned"
                            : item.event_type === "CALL_UNASSIGNED"
                              ? "Removed"
                              : item.event_type === "CALL_ACTIVE_REASSIGNED"
                                ? "Reassigned (Active)"
                                : item.event_type}
                      </td>
                      <td>{item.entity_type}</td>
                      <td>{item.call_number ?? "--"}</td>
                      <td>{item.driver_name ?? "--"}</td>
                      <td>{formatEventDetails(item.event_type, item.metadata_json)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="detail-card">
          <h2>Reset app data</h2>
          <p className="content-subtitle">
            Clears active/pending calls, events, drivers, shifts, and AAA calls/logs so you can start fresh.
          </p>
          <div className="form-row">
            <button
              type="button"
              className="ghost-button"
              disabled={resetLoading}
              onClick={async () => {
                if (!isTauri) return;
                if (!window.confirm("Reset all data? This cannot be undone.")) return;
                const confirmText = window.prompt("Type RESET to confirm.");
                if (confirmText !== "RESET") return;
                setResetLoading(true);
                try {
                  await invoke("app_reset");
                  setAaaMemberRows({});
                  setAaaFlaggedChecklist({});
                  setDailyReportItems([]);
                  setDailyReportDetails({});
                  setDailyReportNotes("");
                  setEventLogItems([]);
                  setEventLogError(null);
                  const now = new Date().toISOString();
                  localStorage.setItem("event-log-last-clear", dateKey(new Date(nowMs)));
                  localStorage.setItem("event-log-last-clear-time", now);
                  setEventLogLastCleared(now);
                  localStorage.removeItem(`daily-report-notes-${dateKey(new Date(nowMs))}`);
                  await refreshDashboard();
                  await refreshSchedule();
                  await refreshDriverReport();
                  await refreshAaaCalls();
                  showToast("Reset complete.");
                  window.alert("Data reset completed.");
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  showToast(`Reset failed: ${message}`);
                } finally {
                  setResetLoading(false);
                }
              }}
            >
              {resetLoading ? "Resetting..." : "Reset all data"}
            </button>
          </div>
        </section>
      </>
    );
  } else if (activeTabId === "drivers") {
    contentBody = (
      <>
        <section className="driver-section">
            <div className="driver-section-header">
              <h2>DRIVERS</h2>
              <div className="driver-section-actions">
                <span className="driver-section-meta">
                  <span className="count-badge">{dashboardDrivers.length}</span>
                </span>
              </div>
            </div>
          <div className="driver-grid">
            {dashboardDrivers.filter((driver) => driver.availability_status !== "ON_LUNCH").length === 0 ? (
              <div className="driver-empty">
                No active drivers scheduled for today. Use Weekly Schedule to add shifts.
              </div>
            ) : (
              dashboardDrivers
                .filter((driver) => driver.availability_status !== "ON_LUNCH")
                .map((driver) => {
                const todayShift = scheduleShiftLookup.get(
                  `${driver.driver_id}-${dateKey(new Date(nowMs))}`
                );
                const isEditing = Boolean(driverEditMode[driver.driver_id]);
                const draft = isEditing
                  ? driverEditDrafts[driver.driver_id] ?? seedDriverCardDraft(driver, todayShift)
                  : null;
                return (
                  <article
                    key={driver.driver_id}
                    className={`driver-card detail-card${
                      selectedDriverId === driver.driver_id ? " is-selected" : ""
                    }`}
                    onClick={() => setSelectedDriverId(driver.driver_id)}
                  >
                    <div className="driver-card-header">
                      <div>
                        {isEditing ? (
                          <input
                            className="driver-edit-input driver-name-input"
                            value={draft?.displayName ?? ""}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              handleDriverEditDraftChange(
                                driver.driver_id,
                                "displayName",
                                event.target.value
                              )
                            }
                          />
                        ) : (
                          <h3>{driver.display_name}</h3>
                        )}
                        <span className="driver-sub">
                          Shift:{" "}
                          {todayShift ? (
                            isEditing ? (
                              <span className="driver-time-range">
                                <input
                                  type="time"
                                  className="driver-edit-input driver-time-input"
                                  value={draft?.shiftStart ?? ""}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    handleDriverEditDraftChange(
                                      driver.driver_id,
                                      "shiftStart",
                                      event.target.value
                                    )
                                  }
                                />
                                <span>–</span>
                                <input
                                  type="time"
                                  className="driver-edit-input driver-time-input"
                                  value={draft?.shiftEnd ?? ""}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    handleDriverEditDraftChange(
                                      driver.driver_id,
                                      "shiftEnd",
                                      event.target.value
                                    )
                                  }
                                />
                              </span>
                            ) : (
                              formatIsoRange(todayShift.shift_start, todayShift.shift_end)
                            )
                          ) : (
                            "--"
                          )}
                        </span>
                      </div>
                      <div className="driver-header-assigned">
                        <span className="driver-header-assigned-label">Truck #</span>
                        <span className="driver-header-assigned-value">
                          {isEditing ? (
                            <input
                              className="driver-edit-input"
                              value={draft?.truckNumber ?? ""}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                handleDriverEditDraftChange(
                                  driver.driver_id,
                                  "truckNumber",
                                  event.target.value
                                )
                              }
                              placeholder="--"
                            />
                          ) : (
                            driver.current_truck
                              ? `${driver.current_truck.truck_number}${driver.current_truck.truck_type ? ` (${driver.current_truck.truck_type})` : ""}`
                              : "--"
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="driver-columns">
                      <div className="driver-column">
                        <div className="driver-meta-row">
                          <span>Shift</span>
                          <span className="driver-meta-value">
                            {todayShift ? (
                              isEditing ? (
                                <span className="driver-time-range">
                                  <input
                                    type="time"
                                    className="driver-edit-input driver-time-input"
                                    value={draft?.shiftStart ?? ""}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      handleDriverEditDraftChange(
                                        driver.driver_id,
                                        "shiftStart",
                                        event.target.value
                                      )
                                    }
                                  />
                                  <span>-</span>
                                  <input
                                    type="time"
                                    className="driver-edit-input driver-time-input"
                                    value={draft?.shiftEnd ?? ""}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      handleDriverEditDraftChange(
                                        driver.driver_id,
                                        "shiftEnd",
                                        event.target.value
                                      )
                                    }
                                  />
                                </span>
                              ) : (
                                formatIsoRange(todayShift.shift_start, todayShift.shift_end)
                              )
                            ) : (
                              "--"
                            )}
                          </span>
                        </div>
                        <div className="driver-meta-row">
                          <span>Lunch started</span>
                          <span className="driver-meta-value">
                            {lunchStartAt[driver.driver_id]
                              ? formatIsoTime(lunchStartAt[driver.driver_id])
                              : driver.availability_status === "ON_LUNCH"
                                ? formatIsoTime(driver.availability_updated_at)
                                : "--"}
                          </span>
                        </div>
                        <div className="driver-meta-row">
                          <span>Status</span>
                          <span className="driver-meta-value">
                            {isEditing ? draft?.status ?? driver.availability_status : driver.availability_status}
                          </span>
                        </div>
                        {isEditing ? (
                          <div className="driver-column-actions">
                            <button
                              className="driver-action-button driver-card-action-btn"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDriverCardSave(driver, todayShift);
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="driver-action-button driver-card-action-btn"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDriverEditCancel(driver.driver_id);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="driver-column">
                        <div className="driver-meta-row">
                          <span>Suggested Lunch</span>
                          <span className="driver-meta-value">
                            {todayShift ? (
                              isEditing ? (
                                <input
                                  type="time"
                                  className="driver-edit-input driver-time-input"
                                  value={draft?.lunchStart ?? ""}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    handleDriverEditDraftChange(
                                      driver.driver_id,
                                      "lunchStart",
                                      event.target.value
                                    )
                                  }
                                />
                              ) : (
                                formatIsoTime(todayShift.lunch_start)
                              )
                            ) : (
                              "--"
                            )}
                          </span>
                        </div>
                        <div className="driver-meta-row">
                          <span>Lunch end</span>
                          <span className="driver-meta-value">
                            {todayShift ? (
                              isEditing ? (
                                <input
                                  type="time"
                                  className="driver-edit-input driver-time-input"
                                  value={draft?.lunchEnd ?? ""}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    handleDriverEditDraftChange(
                                      driver.driver_id,
                                      "lunchEnd",
                                      event.target.value
                                    )
                                  }
                                />
                              ) : (
                                formatIsoTime(todayShift.lunch_end)
                              )
                            ) : (
                              "--"
                            )}
                          </span>
                        </div>
                        <div className="driver-meta-row">
                          <span className="driver-meta-value">
                            <select
                              className="driver-status-select"
                              value={isEditing ? draft?.status ?? driver.availability_status : driver.availability_status}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                if (isEditing) {
                                  handleDriverEditDraftChange(
                                    driver.driver_id,
                                    "status",
                                    event.target.value
                                  );
                                } else {
                                  handleAvailabilityChange(driver.driver_id, event.target.value);
                                }
                              }}
                            >
                              <option value="AVAILABLE">AVAILABLE</option>
                              <option value="ON_LUNCH">ON_LUNCH</option>
                              <option value="BUSY">BUSY</option>
                              <option value="OFF_SHIFT">OFF_SHIFT</option>
                            </select>
                          </span>
                        </div>
                      </div>
                    </div>
                    {!isEditing ? (
                      <div className="driver-card-actions-row">
                        <button
                          className="driver-action-button driver-card-action-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDriverEditStart(driver, todayShift);
                          }}
                        >
                          Edit Driver
                        </button>
                        <button
                          className="driver-action-button driver-card-action-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteEmployeeId(driver.driver_id);
                            setIsDeleteEmployeeOpen(true);
                          }}
                        >
                          Delete Driver
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="driver-section">
          <div className="driver-section-header">
            <h2>On Lunch</h2>
            <span className="driver-section-meta">
              {dashboardDrivers.filter((driver) => driver.availability_status === "ON_LUNCH").length}{" "}
              on break
            </span>
          </div>
          <div className="driver-grid">
            {dashboardDrivers.filter((driver) => driver.availability_status === "ON_LUNCH").length === 0 ? (
              <div className="driver-empty">No drivers on lunch right now.</div>
            ) : (
              dashboardDrivers
                .filter((driver) => driver.availability_status === "ON_LUNCH")
                .map((driver) => {
                const todayShift = scheduleShiftLookup.get(
                  `${driver.driver_id}-${dateKey(new Date(nowMs))}`
                );
                return (
                  <article key={driver.driver_id} className="driver-card detail-card">
                    <div className="driver-card-header">
                      <div>
                        <h3>{driver.display_name}</h3>
                        <span className="driver-sub">
                          Shift:{" "}
                          {todayShift ? formatIsoRange(todayShift.shift_start, todayShift.shift_end) : "--"}
                        </span>
                      </div>
                      <div className="driver-header-assigned">
                        <span className="driver-header-assigned-label">Truck #</span>
                        <span className="driver-header-assigned-value">
                          {driver.current_truck?.truck_number ?? "--"}
                          {driver.current_truck?.truck_type ? ` (${driver.current_truck.truck_type})` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="driver-columns">
                      <div className="driver-column">
                        <div className="driver-meta-row">
                          <span>Lunch started</span>
                          <span className="driver-meta-value">
                            {lunchStartAt[driver.driver_id]
                              ? formatIsoTime(lunchStartAt[driver.driver_id])
                              : formatIsoTime(driver.availability_updated_at)}
                          </span>
                        </div>
                        <div className="driver-meta-row">
                          <span>Lunch remaining</span>
                          <span className="driver-meta-value">
                            {lunchPausedSince[driver.driver_id] ? (
                              <span className="lunch-paused-remaining">
                                {getLunchRemaining(
                                  driver,
                                  todayShift,
                                  nowMs,
                                  pauseLunchAt[driver.driver_id],
                                  lunchStartAt[driver.driver_id],
                                  lunchAccumPausedMs[driver.driver_id],
                                  lunchPausedSince[driver.driver_id]
                                )}{" "}
                                ⏸ Paused
                              </span>
                            ) : (
                              getLunchRemaining(
                                driver,
                                todayShift,
                                nowMs,
                                pauseLunchAt[driver.driver_id],
                                lunchStartAt[driver.driver_id],
                                lunchAccumPausedMs[driver.driver_id],
                                null
                              )
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="driver-column">
                        <div className="driver-meta-row">
                          <span>Lunch ended</span>
                          <span className="driver-meta-value">
                            {todayShift?.lunch_end ? formatIsoTime(todayShift.lunch_end) : "--"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="driver-card-actions-row">
                      {lunchPausedSince[driver.driver_id] ? (
                        <button
                          className="driver-action-button driver-card-action-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            const pausedSince = lunchPausedSince[driver.driver_id];
                            if (pausedSince) {
                              const addedMs = Date.now() - new Date(pausedSince).getTime();
                              const next = { ...lunchAccumPausedMs, [driver.driver_id]: (lunchAccumPausedMs[driver.driver_id] ?? 0) + addedMs };
                              setLunchAccumPausedMs(next);
                              try { localStorage.setItem("lunchAccumPausedMs", JSON.stringify(next)); } catch (err) { console.warn("localStorage write failed:", err); }
                            }
                            setLunchPausedSince((prev) => { const n = { ...prev }; delete n[driver.driver_id]; return n; });
                          }}
                        >
                          Resume lunch
                        </button>
                      ) : (
                        <button
                          className="driver-action-button driver-card-action-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setLunchPausedSince((prev) => ({ ...prev, [driver.driver_id]: new Date().toISOString() }));
                          }}
                        >
                          Pause lunch
                        </button>
                      )}
                      <button
                        className="driver-action-button driver-card-action-btn"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          // Clear accumulated pause data for this driver
                          const next = { ...lunchAccumPausedMs };
                          delete next[driver.driver_id];
                          setLunchAccumPausedMs(next);
                          try { localStorage.setItem("lunchAccumPausedMs", JSON.stringify(next)); } catch (err) { console.warn("localStorage write failed:", err); }
                          setLunchPausedSince((prev) => { const n = { ...prev }; delete n[driver.driver_id]; return n; });
                          void handleAvailabilityChange(driver.driver_id, "AVAILABLE");
                        }}
                      >
                        End lunch
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="driver-section">
          <div className="driver-section-header">
            <h2>Scheduled for Today</h2>
            <span className="driver-section-meta">{shiftsTodayBackend.length} shifts</span>
          </div>
          {shiftsTodayBackend.length === 0 ? (
            <div className="driver-empty">No shifts scheduled for today. Open Weekly Schedule.</div>
          ) : null}
        </section>
      </>
    );

  } else if (activeTabId === "driver-report") {
    contentBody = (
      <>        <section className="driver-section">
          <div className="driver-section-header">
            <h2>Driver Call Report</h2>
            <span className="driver-section-meta">
              {driverReportLoading
                ? "Loading..."
                : driverReportError
                  ? driverReportError
                  : `${filteredDriverReport.length} calls closed`}
            </span>
          </div>
          <div className="driver-section-actions">
            <label className="form-field">
              Status
              <select
                value={reportStatusFilter}
                onChange={(event) =>
                  setReportStatusFilter(event.target.value as "ALL" | "COMPLETED" | "CANCELLED")
                }
              >
                <option value="ALL">All</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className="form-field">
              Start
              <input
                type="date"
                value={reportStartDate}
                onChange={(event) => setReportStartDate(event.target.value)}
              />
            </label>
            <label className="form-field">
              End
              <input
                type="date"
                value={reportEndDate}
                onChange={(event) => setReportEndDate(event.target.value)}
              />
            </label>
            <div className="driver-report-presets">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const now = new Date();
                  const start = startOfWeek(now);
                  const end = new Date(start);
                  end.setDate(start.getDate() + 6);
                  setReportStartDate(dateKey(start));
                  setReportEndDate(dateKey(end));
                }}
              >
                This week
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const now = new Date();
                  setReportStartDate(dateKey(startOfMonth(now)));
                  setReportEndDate(dateKey(endOfMonth(now)));
                }}
              >
                This month
              </button>
            </div>
          </div>
          {driverReportLoading ? (
            <div className="driver-empty">Loading report...</div>
          ) : driverReportError ? (
            <div className="driver-empty">{driverReportError}</div>
          ) : filteredDriverReport.length === 0 ? (
            <div className="driver-empty">No calls in range.</div>
          ) : (
            <div className="driver-grid">
              {scheduleDrivers.map((driver) => {
                const driverCalls = filteredDriverReport.filter(
                  (item) => item.driver_id === driver.id
                );
                return (
                  <article
                    key={driver.id}
                    className={`driver-card detail-card${
                      selectedDriverId === driver.id ? " is-selected" : ""
                    }`}
                    onClick={() => setSelectedDriverId(driver.id)}
                  >
                    <div className="driver-card-header">
                      <div>
                        <h3>{driver.display_name}</h3>
                        <span className="driver-sub">Closed calls today</span>
                      </div>
                      <span className="driver-index">{driverCalls.length}</span>
                    </div>
                    {driverCalls.length === 0 ? (
                      <div className="driver-empty">No completed calls yet.</div>
                    ) : (
                      <div className="call-report-list">
                        {driverCalls.map((item) => {
                          const minutes = durationMinutesBetween(item.en_route_at, item.closed_at);
                          return (
                            <div key={item.call_id} className="call-report-item">
                              <div className="call-report-main">
                                <span className="call-report-type">{item.source_type}</span>
                                <span className="call-report-time">
                                  {formatIsoTime(item.closed_at)}
                                </span>
                              </div>
                              <div className="call-report-meta">
                                <span>{item.outcome}</span>
                                <span>{item.external_call_number ?? "--"}</span>
                                <span>
                                  En route -&gt; 98:{" "}
                                  {minutes == null ? "--" : formatDurationMinutes(minutes)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        <div className="call-report-summary">
                          <div className="call-report-summary-cell">
                            <span className="call-report-summary-label">Avg en route -&gt; 98</span>
                            <span className="call-report-summary-value">
                              {(() => {
                                const durations = driverCalls
                                  .map((item) =>
                                    durationMinutesBetween(item.en_route_at, item.closed_at)
                                  )
                                  .filter((value): value is number => value != null);
                                if (durations.length === 0) return "--";
                                const avg =
                                  durations.reduce((total, value) => total + value, 0) /
                                  durations.length;
                                return formatDurationMinutes(avg);
                              })()}
                            </span>
                          </div>
                          <div className="call-report-summary-cell">
                            <span className="call-report-summary-label">Total calls</span>
                            <span className="call-report-summary-value">{driverCalls.length}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </>
    );

  } else {
    contentBody = (
      <>
        <div className="hero-card">
          <p className="hero-label">DispatcherOne</p>
          <p className="hero-sub">Cortes Towing</p>
          <div className="hero-status">Active tab: {activeLabel}</div>
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <h2>Shift overview</h2>
            <p>Live slots and availability will appear here.</p>
          </article>
          <article className="detail-card">
            <h2>Queue status</h2>
            <p>New calls, dispatch timing, and priority alerts.</p>
          </article>
          <article className="detail-card">
            <h2>Notes</h2>
            <p>Daily reminders and handoff notes for the team.</p>
          </article>
        </div>
      </>
    );
  }

  return (
    <div
      ref={isFloatingWindow || isReportWindow ? nonMainShellRef : null}
      className={`app-shell ${windowModeClass}${showNavigation ? "" : " app-shell--single"}`}
      onKeyDownCapture={handleNonMainEscapeCapture}
      onKeyUpCapture={handleNonMainEscapeCapture}
      tabIndex={isFloatingWindow || isReportWindow ? -1 : undefined}
    >
      {toastMessage && (
        <div className={`app-toast${toastVisible ? " is-visible" : ""}`}>{toastMessage}</div>
      )}
      {showNavigation && (
        <aside className="side-panel" aria-label="Primary navigation">
        <div className="panel-header">
          <button
            className="panel-toggle"
            id="nav-toggle"
            type="button"
            aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
            onClick={() => setIsCollapsed((prev) => !prev)}
          >
            {isCollapsed ? "☰" : "Hide panel"}
          </button>
          <div className="panel-brand">
            <span className="brand-title">Dispatcher</span>
            <span className="brand-title">One</span>
            <span className="brand-subtitle">Made by:</span>
            <span className="brand-subtitle">Kelsey Mellor</span>
          </div>
        </div>

        <nav className="tab-nav" aria-label="Tabs">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              className={`tab-button tab-${tab.id}${index === activeIndex ? " is-active" : ""}`}
              onClick={() => setActiveIndex(index)}
            >
              <span className="tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="panel-footer">
          <div className="shortcut-hint">Ctrl/⌘ + 1-5</div>
        </div>
      </aside>
      )}

      <section className="content">
        <header className="content-header">
          <div className="content-heading-row">
            <h1 className="content-title">{activeLabel.toUpperCase()}</h1>
            {activeTabId === "calls" && !isDrawerWindow && (
              <button className="ghost-button header-add-call-button" onClick={openAddCallDrawer}>
                Add Call
              </button>
            )}
            {activeTabId === "drivers" && !isDrawerWindow && (
              <button
                className="ghost-button header-add-call-button"
                type="button"
                onClick={() => void openDrawerWindow("weekly-schedule")}
              >
                Weekly Schedule
              </button>
            )}
          </div>
          {showHeaderActions && (
            <div className="content-search-row">
              <div
                className="global-search"
                onBlur={() => {
                  window.setTimeout(() => setSearchOpen(false), 150);
                }}
              >
                <input
                  type="search"
                  placeholder="Search calls or drivers"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onFocus={() => {
                    if (searchQuery.trim().length >= 2) setSearchOpen(true);
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults(null);
                      setSearchOpen(false);
                    }}
                  >
                    Clear
                  </button>
                )}
                {searchOpen && (
                  <div className="search-results">
                    {searchLoading ? (
                      <div className="search-empty">Searching...</div>
                    ) : (
                      <>
                        <div className="search-group">
                          <div className="search-group-title">Calls</div>
                          {searchResults?.calls?.length ? (
                            searchResults.calls.map((call) => (
                              <button
                                key={call.call_id}
                                className="search-row"
                                onClick={(event) => {
                                  setSearchOpen(false);
                                  openFloatingDetail(event, call.call_id, null);
                                }}
                              >
                                <div>
                                  <div className="search-title">
                                    {call.external_call_number ?? call.law_agency ?? call.call_id.slice(0, 6)}
                                  </div>
                                  <div className="search-sub">{call.pickup_address}</div>
                                </div>
                                <div className="search-meta">{call.status}</div>
                              </button>
                            ))
                          ) : (
                            <div className="search-empty">No calls found.</div>
                          )}
                        </div>
                        <div className="search-group">
                          <div className="search-group-title">Drivers</div>
                          {searchResults?.drivers?.length ? (
                            searchResults.drivers.map((driver) => (
                              <div key={driver.driver_id} className="search-row is-static">
                                <div>
                                  <div className="search-title">{driver.display_name}</div>
                                  <div className="search-sub">{driver.phone ?? "No phone on file"}</div>
                                </div>
                                <div className="search-meta">{driver.availability_status}</div>
                              </div>
                            ))
                          ) : (
                            <div className="search-empty">No drivers found.</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        <div className="content-body">{contentBody}</div>
      </section>

      {renderFloatingDetail()}

      {isAddCallOpen && !isDrawerWindow && (
        <div className="modal-backdrop drawer-backdrop" role="dialog" aria-modal="true">
          <div
            className="modal-card drawer-card add-call-card"
            style={
              addCallModalHeight != null
                ? ({ ["--add-call-height" as string]: `${addCallModalHeight}px` } as React.CSSProperties)
                : undefined
            }
          >
            <header className="modal-header">
              <h3>Add Call</h3>
            </header>
            <form className="modal-body ocr-form" onSubmit={handleAddCallSubmit}>
              {renderAddCallFormFields()}
            </form>
            <div
              className="add-call-resize-handle"
              role="presentation"
              onMouseDown={startAddCallHeightResize}
            />
          </div>
        </div>
      )}

      {ocrConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Confirm OCR Address</h3>
              <button className="modal-close" onClick={() => setOcrConfirm(null)}>
                Close
              </button>
            </header>
            <div className="modal-body">
              <label className="form-field">
                OCR Result (review/edit)
                <input
                  type="text"
                  value={ocrConfirm.addressText}
                  onChange={(event) =>
                    setOcrConfirm({
                      ...ocrConfirm,
                      addressText: event.target.value,
                      validation: null,
                      validationError: null,
                    })
                  }
                />
              </label>
              {ocrConfirm.validation ? (
                <>
                  <div className="modal-summary">You entered:</div>
                  <div className="ocr-suggestion ocr-suggestion--single">
                    <span className="ocr-suggestion__text">{ocrConfirm.validation.input}</span>
                  </div>
                  <div className="modal-summary">MapQuest suggests:</div>
                  <div className="ocr-suggestion ocr-suggestion--single">
                    <span className="ocr-suggestion__text">{ocrConfirm.validation.formatted_address}</span>
                    <span className="ocr-suggestion__text">
                      Confidence: {confidenceLabel(ocrConfirm.validation.validation_score)}
                    </span>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => applyOcrAddressValidated(ocrConfirm.validation!)}
                    >
                      Accept suggested address
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => applyOcrAddressAsIs(ocrConfirm.validation!.input)}
                    >
                      Keep my text
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setOcrConfirm({ ...ocrConfirm, validation: null, validationError: null })
                      }
                    >
                      Edit again
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {ocrConfirm.validationError ? (
                    <div className="modal-summary">{ocrConfirm.validationError}</div>
                  ) : null}
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleOcrValidate}
                      disabled={ocrConfirm.validating}
                    >
                      {ocrConfirm.validating ? "Validating..." : "Validate address"}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => applyOcrAddressAsIs(ocrConfirm.addressText)}
                    >
                      Use as-is (no validation)
                    </button>
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setOcrConfirm(null);
                  }}
                >
                  Edit manually
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddEmployeeOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Add Driver</h3>
              <button className="modal-close" onClick={() => setIsAddEmployeeOpen(false)}>
                Close
              </button>
            </header>
            <form className="modal-body" onSubmit={handleAddEmployee}>
              <label className="form-field">
                Name
                <input
                  type="text"
                  value={employeeDraft.name}
                  ref={employeeNameInputRef}
                  onChange={(event) =>
                    setEmployeeDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Driver name"
                  required
                />
              </label>
              <label className="form-field">
                Role
                <input type="text" value="Driver" readOnly />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setIsAddEmployeeOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteEmployeeOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Delete Driver</h3>
              <button className="modal-close" onClick={() => setIsDeleteEmployeeOpen(false)}>
                Close
              </button>
            </header>
            <div className="modal-body">
              {scheduleDrivers.length === 0 ? (
                <div className="modal-summary">No drivers to delete.</div>
              ) : (
                <>
                  <label className="form-field">
                    Driver
                    <select
                      value={deleteEmployeeId}
                      onChange={(event) => setDeleteEmployeeId(event.target.value)}
                      required
                    >
                      {scheduleDrivers.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="modal-summary">
                    {`Are you sure you want to delete ${
                      scheduleDrivers.find((employee) => employee.id === deleteEmployeeId)
                        ?.display_name ??
                      "this driver"
                    }?`}
                  </div>
                  <div className="modal-actions modal-actions--split">
                    <button
                      className="ghost-button"
                      onClick={() => setIsDeleteEmployeeOpen(false)}
                    >
                      No
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (!deleteEmployeeId) return;
                        handleDeleteEmployee(deleteEmployeeId);
                        setIsDeleteEmployeeOpen(false);
                      }}
                    >
                      Yes, delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isAddShiftOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Add Shift</h3>
              <button className="modal-close" onClick={() => setIsAddShiftOpen(false)}>
                Close
              </button>
            </header>
            <form className="modal-body" onSubmit={handleAddShift}>
              <label className="form-field">
                Driver
                <select
                  value={shiftDraft.employeeId}
                  ref={shiftEmployeeSelectRef}
                  onChange={(event) =>
                    setShiftDraft((prev) => ({ ...prev, employeeId: event.target.value }))
                  }
                  required
                >
                  <option value="" disabled>
                    Select driver
                  </option>
                  {scheduleDrivers.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Days
                <div className="day-picker">
                  {days.map((day) => {
                    const isSelected = shiftDraft.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`day-chip${isSelected ? " is-selected" : ""}`}
                        onClick={() =>
                          setShiftDraft((prev) => {
                            const exists = prev.days.includes(day);
                            return {
                              ...prev,
                              days: exists
                                ? prev.days.filter((value) => value !== day)
                                : [...prev.days, day],
                            };
                          })
                        }
                      >
                        <span className="day-label">{day}</span>
                        {isSelected && <span className="day-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </label>
              <label className="form-field">
                Lunch override
                <select
                  value={shiftDraft.lunchOverride ? "yes" : "no"}
                  onChange={(event) =>
                    setShiftDraft((prev) => ({
                      ...prev,
                      lunchOverride: event.target.value === "yes",
                    }))
                  }
                >
                  <option value="no">Auto (start + 4h)</option>
                  <option value="yes">Manual</option>
                </select>
              </label>
              <div className="form-row">
                <label className="form-field">
                  Start
                  <input
                    type="time"
                    value={shiftDraft.start}
                    onChange={(event) =>
                      setShiftDraft((prev) => ({ ...prev, start: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="form-field">
                  End
                  <input
                    type="time"
                    value={shiftDraft.end}
                    onChange={(event) =>
                      setShiftDraft((prev) => ({ ...prev, end: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>
              {shiftDraft.lunchOverride ? (
                <div className="form-row">
                  <label className="form-field">
                    Lunch start
                    <input
                      type="time"
                      value={shiftDraft.lunchStart}
                      onChange={(event) =>
                        setShiftDraft((prev) => ({ ...prev, lunchStart: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="form-field">
                    Lunch end
                    <input
                      type="time"
                      value={shiftDraft.lunchEnd}
                      onChange={(event) =>
                        setShiftDraft((prev) => ({ ...prev, lunchEnd: event.target.value }))
                      }
                      required
                    />
                  </label>
                </div>
              ) : null}
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setIsAddShiftOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={scheduleDrivers.length === 0 || shiftDraft.days.length === 0}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingShift && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Edit Shift</h3>
              <button className="modal-close" onClick={() => setEditingShift(null)}>
                Close
              </button>
            </header>
            <form className="modal-body" onSubmit={handleEditShiftSave}>
              <div className="modal-summary">
                {new Date(editingShift.shift_start).toLocaleDateString()} •{" "}
                {scheduleDrivers.find((employee) => employee.id === editingShift.driver_id)
                  ?.display_name || "Employee"}
              </div>
              <label className="form-field">
                Lunch override
                <select
                  value={editDraft.lunchOverride ? "yes" : "no"}
                  onChange={(event) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      lunchOverride: event.target.value === "yes",
                    }))
                  }
                >
                  <option value="no">Auto (start + 4h)</option>
                  <option value="yes">Manual</option>
                </select>
              </label>
              <div className="form-row">
                <label className="form-field">
                  Start
                  <input
                    type="time"
                    value={editDraft.start}
                    onChange={(event) =>
                      setEditDraft((prev) => ({ ...prev, start: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="form-field">
                  End
                  <input
                    type="time"
                    value={editDraft.end}
                    onChange={(event) =>
                      setEditDraft((prev) => ({ ...prev, end: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>
              {editDraft.lunchOverride ? (
                <div className="form-row">
                  <label className="form-field">
                    Lunch start
                    <input
                      type="time"
                      value={editDraft.lunchStart}
                      onChange={(event) =>
                        setEditDraft((prev) => ({ ...prev, lunchStart: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="form-field">
                    Lunch end
                    <input
                      type="time"
                      value={editDraft.lunchEnd}
                      onChange={(event) =>
                        setEditDraft((prev) => ({ ...prev, lunchEnd: event.target.value }))
                      }
                      required
                    />
                  </label>
                </div>
              ) : null}
              <div className="modal-actions modal-actions--split">
                <button type="button" className="danger-button" onClick={handleDeleteShift}>
                  Delete
                </button>
                <div className="modal-actions-right">
                  <button type="button" className="ghost-button" onClick={() => setEditingShift(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button">
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isClearWeekOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Clear week</h3>
              <button className="modal-close" onClick={handleCancelClearWeek}>
                Close
              </button>
            </header>
            <div className="modal-body">
              <div className="modal-summary">
                This will remove all shifts for the current week.
              </div>
              <div className="modal-actions modal-actions--split">
                <button className="danger-button" onClick={handleConfirmClearWeek}>
                  Clear shifts
                </button>
                <div className="modal-actions-right">
                  <button className="ghost-button" onClick={handleCancelClearWeek}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
