export type SourceName =
  | "givefood"
  | "trussell_trust"
  | "ifan"
  | "openstreetmap"
  | "local_council"
  | "manual";

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ReferralType = "required" | "soft" | "none" | "unknown";

export interface OpeningRange {
  start: string;
  end: string;
}

export type OpeningHoursParsed = Partial<Record<WeekdayKey, OpeningRange[]>>;

export interface FoodBank {
  id?: string;
  name: string;
  organisation?: string | null;
  address?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  opening_hours?: string | null;
  opening_hours_parsed?: OpeningHoursParsed | null;
  services?: string[] | null;
  inventory_tags?: string[] | null;
  ai_summary?: string | null;
  ai_confidence?: number | null;
  ai_last_updated?: string | null;
  referral_required?: boolean | null;
  referral_type?: ReferralType | null;
  notes?: string | null;
  source: SourceName;
  last_updated?: string | null;
  open_now?: boolean;
  distance_km?: number | null;
  food_types?: string[] | null;
  baby_supplies?: boolean | null;
  hygiene_products?: boolean | null;
  hot_meals?: boolean | null;
}

export interface FoodBankQuery {
  lat?: number;
  lng?: number;
  radius?: number;
  postcode?: string;
  open_now?: boolean;
  referral_required?: boolean;
  referral_type?: ReferralType;
  organisation?: string;
  page?: number;
  limit?: number;
}

export interface FoodBankSearchQuery {
  postcode?: string;
  city?: string;
  town?: string;
  organisation?: string;
  service?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface FoodBankStats {
  total_foodbanks: number;
  distribution_by_region: Array<{ region: string; count: number }>;
  average_coverage_distance_km: number;
  average_distance_km?: number;
  coverage_gaps_detected?: number;
}

export interface CoverageCell {
  lat: number;
  lng: number;
  distance_to_foodbank: number;
  coverage_score: number;
}

export interface IngestionResult {
  source: SourceName;
  fetched: number;
  normalized: number;
  inserted: number;
  updated: number;
  skipped: number;
  started_at: string;
  finished_at: string;
  errors: string[];
}
