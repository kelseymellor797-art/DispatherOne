# DispatcherOne — API Contract v0 (Cloud SaaS MVP)

> **Version:** 0.1.0  
> **Status:** Draft  
> **Base URL:** `https://<host>/api/v1`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Calls](#2-calls)
3. [Drivers](#3-drivers)
4. [Assignments](#4-assignments)
5. [Dashboard](#5-dashboard)
6. [Shifts](#6-shifts)
7. [Trucks](#7-trucks)
8. [Settings](#8-settings)
9. [Search](#9-search)
10. [Events](#10-events)
11. [Reports](#11-reports)
12. [Admin](#12-admin)
13. [WebSocket Events](#13-websocket-events)
14. [Canonical Statuses & Enums](#14-canonical-statuses--enums)
15. [RBAC Rules](#15-rbac-rules)
16. [Database Schema](#16-database-schema)

---

## Common Conventions

| Convention | Detail |
|---|---|
| IDs | UUIDv4 strings |
| Timestamps | ISO 8601 UTC (`2025-06-15T08:30:00Z`) |
| Auth header | `X-Auth-Token: <token>` |
| Error shape | `{ "detail": "Human-readable message" }` |
| Pagination | `?limit=50&offset=0` (defaults: limit 50, offset 0) |

### Standard Error Responses

| Status | Meaning |
|---|---|
| `400` | Bad request / validation error |
| `401` | Missing or invalid token |
| `403` | Insufficient permissions (RBAC) |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate assignment) |
| `500` | Internal server error |

---

## 1. Authentication

### `GET /health`

Health check — no auth required.

**Response `200`**
```json
{ "status": "ok" }
```

---

### `POST /login`

Authenticate and receive a session token.

**Request**
```json
{ "password": "string" }
```

**Response `200`**
```json
{ "token": "abc123…" }
```

**Errors**

| Status | Detail |
|---|---|
| `401` | Invalid password |
| `500` | `ADMIN_PASSWORD` not configured on server |

---

### `GET /me`

Return the current user's identity and role.

**Headers** — `X-Auth-Token: <token>`

**Response `200`**
```json
{ "role": "admin" }
```

---

## 2. Calls

All endpoints require `X-Auth-Token`.

### `POST /calls`

Create a new call.

**Request**
```json
{
  "source_type": "AAA",
  "law_agency": null,
  "pickup_address": "123 Main St, San Diego, CA",
  "dropoff_address": "456 Oak Ave, San Diego, CA",
  "pickup_notes": "Gate code 1234",
  "contact_id": null,
  "contact_name": "Jane Doe",
  "callback_phone": "619-555-0100",
  "vehicle_description": "2019 Honda Civic, Silver, 4DR",
  "membership_level": "Plus",
  "created_via": "MANUAL",
  "pricing_category": "AAA",
  "notes": null,
  "priority_group": null
}
```

**Response `201`**
```json
{
  "id": "uuid",
  "external_call_number": null,
  "source_type": "AAA",
  "law_agency": null,
  "pickup_address": "123 Main St, San Diego, CA",
  "dropoff_address": "456 Oak Ave, San Diego, CA",
  "pickup_notes": "Gate code 1234",
  "contact_id": null,
  "contact_name": "Jane Doe",
  "callback_phone": "619-555-0100",
  "vehicle_description": "2019 Honda Civic, Silver, 4DR",
  "membership_level": "Plus",
  "status": "PENDING",
  "status_updated_at": "2025-06-15T08:30:00Z",
  "created_via": "MANUAL",
  "created_at": "2025-06-15T08:30:00Z",
  "updated_at": "2025-06-15T08:30:00Z",
  "closed_at": null,
  "outcome": null,
  "pricing_category": "AAA",
  "pricing_total": null,
  "pricing_notes": null,
  "notes": null,
  "priority_group": null
}
```

**Validation**
- `source_type` is required; must be a valid enum value.
- `pickup_address` is required and must be non-empty.
- If `source_type` is `LAW_ENFORCEMENT`, `law_agency` is required.
- If `source_type` is not `LAW_ENFORCEMENT`, `law_agency` must be null.

---

### `GET /calls/:id`

Get call detail including assignments.

**Response `200`**
```json
{
  "call": { "…CallRecord fields…" },
  "assignments": [
    {
      "id": "uuid",
      "driver_id": "uuid",
      "state": "ACTIVE",
      "queue_position": null,
      "manual_sort_key": null,
      "assigned_at": "2025-06-15T09:00:00Z",
      "activated_at": "2025-06-15T09:05:00Z",
      "ended_at": null
    }
  ]
}
```

---

### `PATCH /calls/:id`

Update mutable call fields.

**Request** — include only the fields to change:
```json
{
  "pickup_address": "789 Elm St, San Diego, CA",
  "dropoff_address": "321 Pine Rd, San Diego, CA",
  "pickup_notes": "Updated notes",
  "contact_id": "AAA-12345",
  "contact_name": "John Smith",
  "callback_phone": "619-555-0200",
  "vehicle_description": "2021 Toyota Camry, White",
  "membership_level": "Premier",
  "notes": "Customer waiting in lobby",
  "priority_group": "HIGH"
}
```

**Response `200`** — full updated `CallRecord`.

---

### `POST /calls/:id/status`

Set call status.

**Request**
```json
{ "status": "EN_ROUTE" }
```

**Response `200`** — updated `CallRecord`.

---

### `POST /calls/:id/close`

Close a call with an outcome.

**Request**
```json
{ "outcome": "COMPLETED" }
```

**Response `200`** — updated `CallRecord` with `closed_at` set.

---

### `POST /calls/:id/complete`

Mark a call as complete (shorthand for close with `COMPLETED` outcome).

**Response `200`** — updated `CallRecord`.

---

### `POST /calls/:id/cancel`

Cancel a call (shorthand for close with `CANCELLED` outcome).

**Response `200`** — updated `CallRecord`.

---

### `GET /calls/aaa`

List AAA member calls.

**Query params**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Max results |

**Response `200`**
```json
[
  {
    "id": "uuid",
    "external_call_number": "AAA-001",
    "source_type": "AAA",
    "pickup_address": "…",
    "status": "PENDING",
    "created_at": "2025-06-15T08:30:00Z"
  }
]
```

---

### `GET /calls/:id/tow-distance`

Calculate towing distance for a call.

**Response `200`**
```json
{
  "distance_miles": 12.4,
  "duration_minutes": 18.5
}
```

---

## 3. Drivers

All endpoints require `X-Auth-Token`.

### `GET /drivers`

List active drivers.

**Response `200`**
```json
[
  {
    "id": "uuid",
    "display_name": "Mike Johnson",
    "availability_status": "AVAILABLE",
    "availability_updated_at": "2025-06-15T07:00:00Z",
    "phone": "619-555-0300",
    "capabilities": "flatbed,wheel-lift",
    "notes": null,
    "last_location": "I-5 & Market St",
    "last_location_updated_at": "2025-06-15T08:25:00Z",
    "is_active": true,
    "created_at": "2025-01-10T12:00:00Z",
    "updated_at": "2025-06-15T08:25:00Z"
  }
]
```

---

### `GET /drivers/archived`

List archived (inactive) drivers.

**Response `200`** — same shape as `GET /drivers`.

---

### `POST /drivers`

Create a new driver.

**Request**
```json
{ "display_name": "Mike Johnson" }
```

**Response `201`**
```json
{ "driver_id": "uuid" }
```

---

### `PATCH /drivers/:id`

Update driver fields.

**Request** — include only the fields to change:
```json
{
  "availability_status": "ON_LUNCH",
  "phone": "619-555-0301",
  "notes": "CDL Class A",
  "last_location": "I-8 & College Ave"
}
```

**Response `200`** — updated `DriverRecord`.

---

### `POST /drivers/:id/archive`

Soft-delete (archive) a driver.

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /drivers/:id/restore`

Restore an archived driver.

**Response `200`**
```json
{ "ok": true }
```

---

## 4. Assignments

All endpoints require `X-Auth-Token`.

### `POST /assignments/queue`

Add a call to a driver's queue.

**Request**
```json
{
  "call_id": "uuid",
  "driver_id": "uuid",
  "position": 1
}
```

`position` is optional; omit to append to end of queue.

**Response `201`**
```json
{
  "id": "uuid",
  "call_id": "uuid",
  "driver_id": "uuid",
  "state": "QUEUED",
  "queue_position": 1,
  "assigned_at": "2025-06-15T09:00:00Z"
}
```

**Constraints**
- A call may only have one current assignment (`QUEUED` or `ACTIVE`).
- A driver may only have one `ACTIVE` assignment at a time.

---

### `POST /assignments/queue/move`

Move a call between driver queues or reorder within a queue.

**Request**
```json
{
  "call_id": "uuid",
  "from_owner": "driver-uuid-1",
  "to_owner": "driver-uuid-2",
  "new_position": 1
}
```

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /assignments/:call_id/activate`

Activate a queued assignment (driver begins working the call).

**Request**
```json
{ "driver_id": "uuid" }
```

**Response `200`** — updated assignment record with `activated_at` set.

---

### `POST /assignments/:call_id/reassign`

Reassign the active call to a different driver.

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /assignments/:call_id/unassign`

Remove the current assignment from a call.

**Response `200`**
```json
{ "ok": true }
```

---

## 5. Dashboard

### `GET /dashboard`

Get the full dashboard snapshot.

**Headers** — `X-Auth-Token: <token>`

**Response `200`**
```json
{
  "drivers": [
    {
      "driver": { "…DriverRecord…" },
      "current_truck": {
        "truck_id": "uuid",
        "truck_number": "T-101",
        "truck_type": "flatbed"
      },
      "today_shifts": [
        {
          "id": "uuid",
          "shift_start": "2025-06-15T06:00:00Z",
          "lunch_start": "2025-06-15T11:00:00Z",
          "lunch_end": "2025-06-15T11:30:00Z",
          "shift_end": "2025-06-15T14:00:00Z",
          "shift_label": "Morning",
          "is_cancelled": false
        }
      ]
    }
  ],
  "unassigned_calls": [ "…CallRecord[]…" ],
  "settings": { "key": "value" }
}
```

---

## 6. Shifts

All endpoints require `X-Auth-Token`.

### `GET /drivers/:id/shifts`

List shifts for a driver.

**Query params**

| Param | Type | Description |
|---|---|---|
| `date` | `YYYY-MM-DD` | Filter by date (optional) |

**Response `200`**
```json
[
  {
    "id": "uuid",
    "driver_id": "uuid",
    "shift_start": "2025-06-15T06:00:00Z",
    "lunch_start": "2025-06-15T11:00:00Z",
    "lunch_end": "2025-06-15T11:30:00Z",
    "shift_end": "2025-06-15T14:00:00Z",
    "shift_label": "Morning",
    "is_cancelled": false,
    "created_at": "2025-06-14T20:00:00Z",
    "updated_at": "2025-06-14T20:00:00Z"
  }
]
```

---

### `POST /drivers/:id/shifts`

Create a shift for a driver.

**Request**
```json
{
  "shift_start": "2025-06-15T06:00:00Z",
  "lunch_start": "2025-06-15T11:00:00Z",
  "lunch_end": "2025-06-15T11:30:00Z",
  "shift_end": "2025-06-15T14:00:00Z",
  "shift_label": "Morning"
}
```

**Response `201`** — created shift record.

---

### `POST /shifts/:id/cancel`

Cancel a scheduled shift.

**Response `200`**
```json
{ "ok": true }
```

---

## 7. Trucks

All endpoints require `X-Auth-Token`.

### `GET /trucks`

List active trucks.

**Response `200`**
```json
[
  {
    "id": "uuid",
    "truck_number": "T-101",
    "truck_type": "flatbed",
    "notes": "New tires 2025-05",
    "is_active": true
  }
]
```

---

### `POST /trucks`

Create a truck.

**Request**
```json
{
  "truck_number": "T-102",
  "truck_type": "wheel-lift",
  "notes": null
}
```

**Response `201`** — created truck record.

**Constraints** — `truck_number` must be unique.

---

### `POST /drivers/:driver_id/truck`

Assign a truck to a driver.

**Request**
```json
{
  "truck_id": "uuid",
  "note": "Assigned for morning shift"
}
```

**Response `201`**
```json
{
  "id": "uuid",
  "driver_id": "uuid",
  "truck_id": "uuid",
  "start_time": "2025-06-15T06:00:00Z",
  "end_time": null,
  "note": "Assigned for morning shift",
  "created_at": "2025-06-15T06:00:00Z"
}
```

---

## 8. Settings

All endpoints require `X-Auth-Token`.

### `GET /settings`

Get all settings as key-value pairs.

**Response `200`**
```json
{
  "company_name": "Dispatch Co.",
  "default_pricing_category": "AAA"
}
```

---

### `PUT /settings/:key`

Create or update a setting.

**Request**
```json
{ "value": "New Company Name" }
```

**Response `200`**
```json
{
  "key": "company_name",
  "value": "New Company Name",
  "updated_at": "2025-06-15T10:00:00Z"
}
```

---

## 9. Search

All endpoints require `X-Auth-Token`.

### `GET /search/drivers`

Search drivers by name, phone, or other attributes.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Search query (required) |

**Response `200`** — array of matching `DriverRecord` objects.

---

### `GET /search/calls`

Search calls by call number, address, contact, or vehicle.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Search query (required) |

**Response `200`** — array of matching `CallRecord` objects.

---

## 10. Events

All endpoints require `X-Auth-Token`.

### `GET /events`

List event log entries.

**Query params**

| Param | Type | Description |
|---|---|---|
| `entity_type` | string | `CALL` or `DRIVER` (optional) |
| `entity_id` | string | Filter by entity UUID (optional) |
| `limit` | integer | Max results (default `100`) |
| `offset` | integer | Pagination offset (default `0`) |

**Response `200`**
```json
[
  {
    "id": "uuid",
    "timestamp": "2025-06-15T09:05:00Z",
    "entity_type": "CALL",
    "entity_id": "call-uuid",
    "event_type": "STATUS_CHANGED",
    "metadata_json": "{\"from\":\"PENDING\",\"to\":\"ASSIGNED\"}"
  }
]
```

---

## 11. Reports

### `GET /reports`

Generate or retrieve dispatch reports.

**Headers** — `X-Auth-Token: <token>`

**Query params**

| Param | Type | Description |
|---|---|---|
| `start_date` | `YYYY-MM-DD` | Report start date |
| `end_date` | `YYYY-MM-DD` | Report end date |
| `type` | string | Report type (e.g. `daily_summary`) |

**Response `200`** — report data (format depends on `type`).

---

## 12. Admin

### `POST /admin/reset`

Reset the application to factory defaults. **Requires `admin` role.**

**Headers** — `X-Auth-Token: <token>`

**Response `200`**
```json
{ "ok": true }
```

---

## 13. WebSocket Events

### Connection

```
ws://<host>/api/v1/ws?token=<auth-token>
```

The server authenticates the WebSocket connection using the `token` query parameter. Invalid or missing tokens result in an immediate close with code `4001`.

### Message Envelope

All WebSocket messages use a standard envelope:

```json
{
  "event": "string",
  "payload": { },
  "timestamp": "2025-06-15T09:05:00Z"
}
```

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `call.created` | `CallRecord` | A new call was created |
| `call.updated` | `CallRecord` | Call fields were updated |
| `call.status_changed` | `{ "call_id", "from", "to" }` | Call status transitioned |
| `call.closed` | `{ "call_id", "outcome" }` | Call was closed |
| `driver.updated` | `DriverRecord` | Driver record changed |
| `driver.availability_changed` | `{ "driver_id", "from", "to" }` | Driver availability changed |
| `driver.location_updated` | `{ "driver_id", "last_location", "last_location_updated_at" }` | Driver location updated |
| `assignment.created` | `CallAssignment` | Call assigned to driver queue |
| `assignment.activated` | `{ "call_id", "driver_id" }` | Queued assignment activated |
| `assignment.ended` | `{ "call_id", "driver_id" }` | Assignment ended |
| `assignment.moved` | `{ "call_id", "from_driver", "to_driver", "position" }` | Assignment moved between queues |
| `dashboard.refresh` | `{}` | Clients should re-fetch dashboard |
| `shift.created` | `ShiftRecord` | New shift scheduled |
| `shift.cancelled` | `{ "shift_id" }` | Shift cancelled |
| `settings.updated` | `{ "key", "value" }` | A setting was changed |

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `ping` | `{}` | Keep-alive ping |

### Server → Client Responses

| Event | Payload | Description |
|---|---|---|
| `pong` | `{}` | Keep-alive pong |
| `error` | `{ "detail": "string" }` | Error notification |

---

## 14. Canonical Statuses & Enums

### Call Status

Numeric codes (`94`, `95`, `97`, `98`) are industry-standard tow dispatch radio codes.

| Value | Description |
|---|---|
| `PENDING` | Call created, awaiting assignment |
| `ACTIVE` | Call is active / being worked |
| `ASSIGNED` | Call assigned to a driver |
| `EN_ROUTE` | Driver en route to pickup |
| `94` | Arrived on scene |
| `95` | Hooking / loading vehicle |
| `97` | En route to drop-off |
| `IN_TOW` | Vehicle currently being towed |
| `98` | Cleared / dropped off |

### Call Outcome

| Value | Description |
|---|---|
| `COMPLETED` | Call successfully completed |
| `CANCELLED` | Call was cancelled |

### Driver Availability

| Value | Description |
|---|---|
| `AVAILABLE` | Ready for dispatch |
| `ON_LUNCH` | On lunch break |
| `BUSY` | Currently occupied |
| `OFF_SHIFT` | Not on shift |

### Assignment State

| Value | Description |
|---|---|
| `QUEUED` | Waiting in driver's queue |
| `ACTIVE` | Driver is working this call |
| `ENDED` | Assignment completed or removed |

### Source Type

| Value | Description |
|---|---|
| `AAA` | AAA roadside assistance |
| `AAA_RAP` | AAA Roadside Assistance Program |
| `PPI` | Private paying individual |
| `COD` | Cash on delivery |
| `LAW_ENFORCEMENT` | Law enforcement request |

### Law Agency

| Value | Description |
|---|---|
| `SHERIFF` | Sheriff's Department |
| `CVPD` | Chula Vista Police Department |
| `CHP` | California Highway Patrol |
| `SDPD` | San Diego Police Department |

### Created Via

| Value | Description |
|---|---|
| `MANUAL` | Manually entered by dispatcher |
| `OCR` | Imported via OCR scan |

### Pricing Category

Same values as [Source Type](#source-type).

### OCR Template Type

| Value | Description |
|---|---|
| `ACE_PICKUP` | ACE pickup form |
| `ACE_DROPOFF` | ACE drop-off form |

### Event Entity Type

| Value | Description |
|---|---|
| `CALL` | Event relates to a call |
| `DRIVER` | Event relates to a driver |

---

## 15. RBAC Rules

### Roles

| Role | Description |
|---|---|
| `admin` | Full access to all resources and settings |
| `dispatcher` | Create/manage calls, assign drivers, view dashboard |
| `driver` | View own assignments, update own status/location |
| `viewer` | Read-only access to dashboard and calls |

### Permission Matrix

| Resource | Action | admin | dispatcher | driver | viewer |
|---|---|---|---|---|---|
| **Calls** | create | ✅ | ✅ | ❌ | ❌ |
| | read | ✅ | ✅ | own | ✅ |
| | update | ✅ | ✅ | ❌ | ❌ |
| | close / cancel | ✅ | ✅ | ❌ | ❌ |
| | set status | ✅ | ✅ | own | ❌ |
| **Drivers** | create | ✅ | ❌ | ❌ | ❌ |
| | read | ✅ | ✅ | own | ✅ |
| | update | ✅ | ❌ | own | ❌ |
| | archive / restore | ✅ | ❌ | ❌ | ❌ |
| **Assignments** | create | ✅ | ✅ | ❌ | ❌ |
| | activate | ✅ | ✅ | own | ❌ |
| | reassign / unassign | ✅ | ✅ | ❌ | ❌ |
| | move queue | ✅ | ✅ | ❌ | ❌ |
| **Dashboard** | read | ✅ | ✅ | ❌ | ✅ |
| **Shifts** | create / cancel | ✅ | ✅ | ❌ | ❌ |
| | read | ✅ | ✅ | own | ✅ |
| **Trucks** | create | ✅ | ❌ | ❌ | ❌ |
| | read | ✅ | ✅ | ✅ | ✅ |
| | assign to driver | ✅ | ✅ | ❌ | ❌ |
| **Settings** | read | ✅ | ✅ | ❌ | ❌ |
| | update | ✅ | ❌ | ❌ | ❌ |
| **Events** | read | ✅ | ✅ | own | ✅ |
| **Reports** | read | ✅ | ✅ | ❌ | ❌ |
| **Admin** | reset | ✅ | ❌ | ❌ | ❌ |
| **WebSocket** | connect | ✅ | ✅ | ✅ | ✅ |

> **"own"** = the driver can only access or modify records associated with their own `driver_id`.

---

## 16. Database Schema

### `schema_migrations`

| Column | Type | Constraints |
|---|---|---|
| `version` | TEXT | PRIMARY KEY |
| `filename` | TEXT | NOT NULL |
| `applied_at` | TEXT | NOT NULL |

### `app_meta`

| Column | Type | Constraints |
|---|---|---|
| `key` | TEXT | PRIMARY KEY |
| `value` | TEXT | NOT NULL |

### `drivers`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `display_name` | TEXT | NOT NULL, non-empty |
| `is_active` | INTEGER | NOT NULL, DEFAULT 1, 0 or 1 |
| `availability_status` | TEXT | NOT NULL, one of `AVAILABLE`, `ON_LUNCH`, `BUSY`, `OFF_SHIFT` |
| `availability_updated_at` | TEXT | NOT NULL |
| `phone` | TEXT | |
| `capabilities` | TEXT | |
| `notes` | TEXT | |
| `last_location` | TEXT | |
| `last_location_updated_at` | TEXT | |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `calls`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `external_call_number` | TEXT | |
| `source_type` | TEXT | NOT NULL, one of `AAA`, `AAA_RAP`, `PPI`, `COD`, `LAW_ENFORCEMENT` |
| `law_agency` | TEXT | one of `SHERIFF`, `CVPD`, `CHP`, `SDPD`; required when `source_type` = `LAW_ENFORCEMENT` |
| `pickup_address` | TEXT | NOT NULL, non-empty |
| `dropoff_address` | TEXT | |
| `pickup_notes` | TEXT | |
| `contact_id` | TEXT | |
| `contact_name` | TEXT | |
| `callback_phone` | TEXT | |
| `vehicle_description` | TEXT | |
| `membership_level` | TEXT | |
| `status` | TEXT | NOT NULL, one of `ACTIVE`, `PENDING`, `ASSIGNED`, `EN_ROUTE`, `94`, `95`, `97`, `IN_TOW`, `98` |
| `status_updated_at` | TEXT | NOT NULL |
| `created_via` | TEXT | NOT NULL, one of `MANUAL`, `OCR` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `closed_at` | TEXT | |
| `outcome` | TEXT | one of `COMPLETED`, `CANCELLED` |
| `pricing_category` | TEXT | NOT NULL, one of `AAA`, `AAA_RAP`, `PPI`, `COD`, `LAW_ENFORCEMENT` |
| `pricing_total` | REAL | |
| `pricing_notes` | TEXT | |
| `notes` | TEXT | |
| `priority_group` | TEXT | |

### `call_assignments`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `call_id` | TEXT | NOT NULL, FK → `calls(id)` ON DELETE CASCADE |
| `driver_id` | TEXT | NOT NULL, FK → `drivers(id)` ON DELETE CASCADE |
| `state` | TEXT | NOT NULL, one of `QUEUED`, `ACTIVE`, `ENDED` |
| `queue_position` | INTEGER | required when `state` = `QUEUED` |
| `manual_sort_key` | REAL | |
| `assigned_at` | TEXT | NOT NULL |
| `activated_at` | TEXT | |
| `ended_at` | TEXT | |

**Unique constraints:**
- One current (`QUEUED` or `ACTIVE`) assignment per call.
- One `ACTIVE` assignment per driver.

### `events`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `timestamp` | TEXT | NOT NULL |
| `entity_type` | TEXT | NOT NULL, one of `CALL`, `DRIVER` |
| `entity_id` | TEXT | NOT NULL |
| `event_type` | TEXT | NOT NULL |
| `metadata_json` | TEXT | |

### `settings_kv`

| Column | Type | Constraints |
|---|---|---|
| `key` | TEXT | PRIMARY KEY |
| `value` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `driver_shifts`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `driver_id` | TEXT | NOT NULL, FK → `drivers(id)` ON DELETE CASCADE |
| `shift_start` | TEXT | NOT NULL |
| `lunch_start` | TEXT | NOT NULL |
| `lunch_end` | TEXT | NOT NULL |
| `shift_end` | TEXT | NOT NULL |
| `shift_label` | TEXT | |
| `is_cancelled` | INTEGER | NOT NULL, DEFAULT 0, 0 or 1 |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `trucks`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `truck_number` | TEXT | NOT NULL, non-empty, UNIQUE |
| `truck_type` | TEXT | |
| `notes` | TEXT | |
| `is_active` | INTEGER | NOT NULL, DEFAULT 1, 0 or 1 |

### `driver_truck_assignments`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `driver_id` | TEXT | NOT NULL, FK → `drivers(id)` ON DELETE CASCADE |
| `truck_id` | TEXT | NOT NULL, FK → `trucks(id)` ON DELETE CASCADE |
| `start_time` | TEXT | NOT NULL |
| `end_time` | TEXT | |
| `note` | TEXT | |
| `created_at` | TEXT | NOT NULL |

### `rate_rules`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `category` | TEXT | NOT NULL, one of `AAA`, `AAA_RAP`, `PPI`, `COD`, `LAW_ENFORCEMENT` |
| `rule_name` | TEXT | NOT NULL, non-empty |
| `amount` | REAL | NOT NULL |
| `unit` | TEXT | NOT NULL, non-empty |
| `conditions_json` | TEXT | |
| `is_active` | INTEGER | NOT NULL, DEFAULT 1, 0 or 1 |
| `updated_at` | TEXT | NOT NULL |

### `ocr_imports`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `template_type` | TEXT | NOT NULL, one of `ACE_PICKUP`, `ACE_DROPOFF` |
| `image_ref` | TEXT | NOT NULL |
| `raw_text` | TEXT | NOT NULL |
| `parsed_fields_json` | TEXT | |
| `confidence_json` | TEXT | |
| `created_call_id` | TEXT | FK → `calls(id)` ON DELETE SET NULL |
| `created_at` | TEXT | NOT NULL |

### `address_geocodes`

| Column | Type | Constraints |
|---|---|---|
| `normalized_address` | TEXT | PRIMARY KEY |
| `raw_address` | TEXT | NOT NULL |
| `lat` | REAL | NOT NULL |
| `lon` | REAL | NOT NULL |
| `provider` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `driver_last_location`

| Column | Type | Constraints |
|---|---|---|
| `driver_id` | TEXT | PRIMARY KEY, FK → `drivers(id)` |
| `lat` | REAL | NOT NULL |
| `lon` | REAL | NOT NULL |
| `source` | TEXT | NOT NULL |
| `source_call_id` | TEXT | |
| `source_address` | TEXT | |
| `updated_at` | TEXT | NOT NULL |

### `call_driver_distance_cache`

| Column | Type | Constraints |
|---|---|---|
| `call_id` | TEXT | NOT NULL, FK → `calls(id)`, composite PK |
| `driver_id` | TEXT | NOT NULL, FK → `drivers(id)`, composite PK |
| `distance_miles` | REAL | NOT NULL |
| `duration_minutes` | REAL | |
| `pickup_geocode_at` | TEXT | NOT NULL |
| `driver_loc_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
