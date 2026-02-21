import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NearbyDriver } from "../nearby/types";
import { InlineLoader } from "./InlineLoader";

function btn(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export function DriversNearby(props: {
  callId: string;
  max?: number;
  refreshToken?: number;
  canRefresh?: boolean;
}) {
  const max = props.max ?? 6;
  const canRefresh = props.canRefresh ?? false;

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<NearbyDriver[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const top = useMemo(() => items.slice(0, max), [items, max]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await invoke<NearbyDriver[]>("call_nearby_drivers", { callId: props.callId });
      setItems(res);
      setLastLoadedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setErr(null);
    setLastLoadedAt(null);
  }, [props.callId]);


  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Drivers Nearby</div>
        <button
          style={btn()}
          onClick={() => setOpen((v) => !v)}
          title="Show / hide nearby drivers"
        >
          {open ? "v Hide" : "> Show"}
        </button>

        {open && (
          <button
            style={btn()}
            onClick={() => {
              if (!canRefresh) {
                setErr("Confirm pickup address before refreshing nearby drivers.");
                return;
              }
              void load();
            }}
            disabled={busy}
            title="Refresh distances"
          >
            Refresh
          </button>
        )}

        <div style={{ marginLeft: "auto", opacity: 0.6, fontSize: 12 }}>
          {open && lastLoadedAt ? `last updated ${lastLoadedAt}` : ""}
        </div>
      </div>

      {open && (
        <div
          style={{
            marginTop: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: 10,
          }}
        >
          {busy && <InlineLoader label="Calculating driving distance..." />}
          {err && (
            <div style={{ color: "#ffb4b4", fontSize: 12 }}>
              {err}
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                If this says \"Pickup address not geocoded\" or \"No geocode result\", we will add a
                fallback button next to manually confirm/clean the pickup address string.
              </div>
            </div>
          )}

          {!busy && !err && items.length === 0 && (
            <div style={{ opacity: 0.7, fontSize: 12 }}>No active drivers with locations yet.</div>
          )}

          {!busy && !err && items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {top.map((d) => (
                <div
                  key={d.driver_id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10,
                    padding: "8px 10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 700 }}>
                      {typeof d.distance_miles_rounded === "number"
                        ? `${d.distance_miles_rounded.toFixed(1)} mi`
                        : "Distance unavailable"}
                      {typeof d.eta_minutes === "number" ? (
                        <span style={{ opacity: 0.7, fontWeight: 500 }}>
                          {" "} - {d.eta_minutes.toFixed(0)} min
                        </span>
                      ) : null}
                    </div>
                    <div style={{ opacity: 0.8 }}>
                      {d.truck_number ? `Truck ${d.truck_number}` : "--"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      gap: 12,
                      marginTop: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{d.display_name}</div>
                      <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>
                        {d.availability_status}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {d.active_call_status ?? "--"}
                    </div>
                  </div>

                  <div style={{ opacity: 0.6, fontSize: 11, marginTop: 6 }}>
                    {d.last_location_text
                      ? d.location_source && d.location_updated_at
                        ? `location: ${d.last_location_text} (${d.location_source}) - updated ${d.location_updated_at}`
                        : d.location_updated_at
                          ? `location: ${d.last_location_text} - updated ${d.location_updated_at}`
                          : `location: ${d.last_location_text}`
                      : d.location_source && d.location_updated_at
                        ? `location: ${d.location_source} - updated ${d.location_updated_at}`
                        : "location: not provided"}
                  </div>
                </div>
              ))}

              {items.length > max && (
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                  showing top {max} of {items.length}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
