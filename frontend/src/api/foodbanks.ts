import type {
  CoverageCell,
  FoodBank,
  FoodBankStats,
  ReferralType
} from "@foodbankfinder/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface ListResponse {
  data: FoodBank[];
  meta: {
    total: number;
    page: number;
    limit: number;
    center?: {
      latitude: number;
      longitude: number;
    } | null;
  };
}

interface NearbyResponse {
  data: FoodBank[];
}

interface CoverageResponse {
  data: CoverageCell[];
}

interface SimpleDataResponse<T> {
  data: T;
}

export interface FoodbanksListParams {
  page?: number;
  limit?: number;
  open_now?: boolean;
  referral_required?: boolean;
  referral_type?: ReferralType;
  organisation?: string;
}

export interface NearbyFoodbanksParams {
  open_now?: boolean;
  referral_required?: boolean;
  referral_type?: ReferralType;
  organisation?: string;
  limit?: number;
}

export interface SearchFoodbanksParams {
  q?: string;
  postcode?: string;
  city?: string;
  organisation?: string;
  service?: string;
  page?: number;
  limit?: number;
}

const toQueryString = (input: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();

  Object.entries(input).forEach(([key, value]) => {
    if (value == null || value === "") return;
    params.set(key, String(value));
  });

  return params.toString();
};

const request = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchFoodbanks = async (
  params: FoodbanksListParams = {}
): Promise<ListResponse> => {
  const query = toQueryString({
    page: params.page ?? 1,
    limit: params.limit ?? 5000,
    open_now: params.open_now,
    referral_required: params.referral_required,
    referral_type: params.referral_type,
    organisation: params.organisation
  });

  return request<ListResponse>(`/api/foodbanks?${query}`);
};

export const fetchNearbyFoodbanks = async (
  lat: number,
  lng: number,
  radius: number,
  params: NearbyFoodbanksParams = {}
): Promise<FoodBank[]> => {
  const query = toQueryString({
    lat,
    lng,
    radius,
    open_now: params.open_now,
    referral_required: params.referral_required,
    referral_type: params.referral_type,
    organisation: params.organisation,
    limit: params.limit ?? 2000
  });

  const response = await request<NearbyResponse>(`/api/foodbanks/nearby?${query}`);
  return response.data;
};

export const fetchOpenNearbyFoodbanks = async (
  lat: number,
  lng: number,
  radius: number,
  limit = 10
): Promise<FoodBank[]> => {
  const query = toQueryString({
    lat,
    lng,
    radius,
    limit
  });

  const response = await request<NearbyResponse>(`/api/foodbanks/open-nearby?${query}`);
  return response.data;
};

export const searchFoodbanks = async (
  params: SearchFoodbanksParams
): Promise<ListResponse> => {
  const query = toQueryString({
    q: params.q,
    postcode: params.postcode,
    city: params.city,
    organisation: params.organisation,
    service: params.service,
    page: params.page ?? 1,
    limit: params.limit ?? 5000
  });

  return request<ListResponse>(`/api/foodbanks/search?${query}`);
};

export const fetchFoodbankById = async (id: string): Promise<FoodBank> => {
  const response = await request<SimpleDataResponse<FoodBank>>(`/api/foodbanks/${id}`);
  return response.data;
};

export const fetchFoodbankStats = async (): Promise<FoodBankStats> => {
  const response = await request<SimpleDataResponse<FoodBankStats>>(`/api/foodbanks/stats`);
  return response.data;
};

export const fetchOrganisations = async (): Promise<string[]> => {
  const response = await request<SimpleDataResponse<string[]>>(`/api/foodbanks/organisations`);
  return response.data;
};

export const fetchCoverageCells = async (limit = 8000): Promise<CoverageCell[]> => {
  const query = toQueryString({ limit });
  const response = await request<CoverageResponse>(`/api/foodbanks/coverage?${query}`);
  return response.data;
};
