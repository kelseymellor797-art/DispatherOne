import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type UnitPosition = {
  unit_id: string;
  truck_number: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  updated_at: string;
};

export function UnitsPanel() {
  const [units, setUnits] = useState<UnitPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state for manual position setter
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [speed, setSpeed] = useState("0");
  const [heading, setHeading] = useState("0");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const loadUnits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<UnitPosition[]>("unit_list");
      setUnits(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  // Listen for real-time position updates
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      const unlisten = await listen("unit-position-updated", () => {
        if (!cancelled) {
          void loadUnits();
        }
      });
      if (cancelled) {
        unlisten();
      } else {
        return unlisten;
      }
    };
    let cleanup: (() => void) | undefined;
    setup().then((fn) => {
      if (fn) cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [loadUnits]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers when units change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set<string>();
    const bounds: L.LatLngTuple[] = [];

    for (const unit of units) {
      if (unit.lat === 0 && unit.lng === 0) continue;

      currentIds.add(unit.unit_id);
      const pos: L.LatLngTuple = [unit.lat, unit.lng];
      bounds.push(pos);

      const existing = markersRef.current.get(unit.unit_id);
      if (existing) {
        existing.setLatLng(pos);
        existing.setPopupContent(markerPopup(unit));
      } else {
        const marker = L.marker(pos)
          .addTo(map)
          .bindPopup(markerPopup(unit));
        markersRef.current.set(unit.unit_id, marker);
      }
    }

    // Remove markers for units no longer in the list
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Fit bounds if there are markers
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
    }
  }, [units]);

  const markerPopup = (unit: UnitPosition): string => {
    return `<b>Truck ${unit.truck_number}</b><br/>
Lat: ${unit.lat.toFixed(6)}<br/>
Lng: ${unit.lng.toFixed(6)}<br/>
Speed: ${unit.speed.toFixed(1)} mph<br/>
Heading: ${unit.heading.toFixed(0)}°<br/>
Updated: ${unit.updated_at ? new Date(unit.updated_at).toLocaleString() : "N/A"}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId || !lat || !lng) return;

    try {
      setSaving(true);
      setSaveMsg(null);
      await invoke("unit_position_set", {
        unitId: selectedUnitId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        speed: parseFloat(speed || "0"),
        heading: parseFloat(heading || "0"),
      });
      setSaveMsg("Position updated!");
      // Reload units to show new position
      await loadUnits();
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const selectUnitForEdit = (unit: UnitPosition) => {
    setSelectedUnitId(unit.unit_id);
    setLat(unit.lat !== 0 ? String(unit.lat) : "");
    setLng(unit.lng !== 0 ? String(unit.lng) : "");
    setSpeed(String(unit.speed));
    setHeading(String(unit.heading));
    setSaveMsg(null);
  };

  return (
    <>
      {/* Map View */}
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 300,
          borderRadius: 12,
          marginBottom: 16,
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      />

      {/* Units List */}
      <section className="driver-section">
        <div className="driver-section-header">
          <h2>UNITS</h2>
          <div className="driver-section-actions">
            <span className="driver-section-meta">
              <span className="count-badge">{units.length}</span>
            </span>
            <button
              className="ghost-button"
              onClick={() => void loadUnits()}
              style={{ marginLeft: 8, fontSize: 12 }}
            >
              Refresh
            </button>
          </div>
        </div>

        {loading && <div className="driver-empty">Loading units...</div>}
        {error && <div className="driver-empty">Error: {error}</div>}

        <div className="driver-grid">
          {!loading && units.length === 0 && (
            <div className="driver-empty">No active units/trucks found. Add trucks via the Drivers tab.</div>
          )}
          {units.map((unit) => (
            <article
              key={unit.unit_id}
              className={`driver-card detail-card${selectedUnitId === unit.unit_id ? " is-selected" : ""}`}
              onClick={() => selectUnitForEdit(unit)}
              style={{ cursor: "pointer" }}
            >
              <div className="driver-card-header">
                <div>
                  <span className="driver-name">Truck {unit.truck_number}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                {unit.lat !== 0 || unit.lng !== 0 ? (
                  <>
                    <div>Lat: {unit.lat.toFixed(6)}, Lng: {unit.lng.toFixed(6)}</div>
                    <div>Speed: {unit.speed.toFixed(1)} mph &middot; Heading: {unit.heading.toFixed(0)}&deg;</div>
                    {unit.updated_at && (
                      <div style={{ opacity: 0.6 }}>Updated: {new Date(unit.updated_at).toLocaleString()}</div>
                    )}
                  </>
                ) : (
                  <div style={{ fontStyle: "italic" }}>No position set</div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Manual Position Setter */}
      <section className="driver-section" style={{ marginTop: 16 }}>
        <div className="driver-section-header">
          <h2>SET POSITION</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="detail-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="form-field">
              Unit
              <select
                value={selectedUnitId}
                onChange={(e) => {
                  const uid = e.target.value;
                  setSelectedUnitId(uid);
                  const u = units.find((u) => u.unit_id === uid);
                  if (u) {
                    setLat(u.lat !== 0 ? String(u.lat) : "");
                    setLng(u.lng !== 0 ? String(u.lng) : "");
                    setSpeed(String(u.speed));
                    setHeading(String(u.heading));
                  }
                  setSaveMsg(null);
                }}
              >
                <option value="">Select a unit...</option>
                {units.map((u) => (
                  <option key={u.unit_id} value={u.unit_id}>
                    Truck {u.truck_number}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: 10 }}>
              <label className="form-field" style={{ flex: 1 }}>
                Latitude
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="e.g. 40.7128"
                  required
                />
              </label>
              <label className="form-field" style={{ flex: 1 }}>
                Longitude
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="e.g. -74.0060"
                  required
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <label className="form-field" style={{ flex: 1 }}>
                Speed (mph)
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                />
              </label>
              <label className="form-field" style={{ flex: 1 }}>
                Heading (°)
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="360"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                className="ghost-button"
                type="submit"
                disabled={saving || !selectedUnitId || !lat || !lng}
              >
                {saving ? "Saving..." : "Update Position"}
              </button>
              {saveMsg && (
                <span style={{ fontSize: 12, opacity: 0.8 }}>{saveMsg}</span>
              )}
            </div>
          </div>
        </form>
      </section>
    </>
  );
}
