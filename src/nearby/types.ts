export type NearbyDriver = {
  driver_id: string;
  display_name: string;
  truck_number?: string | null;
  availability_status: string;
  active_call_status?: string | null;
  last_location_text?: string | null;

  distance_miles: number | null;
  distance_miles_rounded: number | null;
  eta_minutes?: number | null;

  location_source?: string | null;
  location_updated_at?: string | null;
};
