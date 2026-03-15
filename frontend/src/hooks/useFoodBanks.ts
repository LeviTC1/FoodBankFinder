import { useEffect, useMemo, useState } from "react";
import type { FoodBank } from "@foodbankfinder/shared";
import {
  fetchFoodbanks,
  fetchNearbyFoodbanks,
  searchFoodbanks
} from "@/api/foodbanks";
import type { UserLocation } from "./useUserLocation";

export interface UiFilters {
  search: string;
  openToday: boolean;
  referral: "any" | "required" | "no_referral";
  radiusKm: number;
  organisation: string;
  useMyLocation: boolean;
}

export const useFoodBanks = (filters: UiFilters, location: UserLocation | null) => {
  const [data, setData] = useState<FoodBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<UserLocation | null>(null);

  const derivedFilters = useMemo(() => {
    const referralRequired =
      filters.referral === "required"
        ? true
        : filters.referral === "no_referral"
          ? false
          : undefined;

    return {
      search: filters.search.trim(),
      open_now: filters.openToday || undefined,
      referral_required: referralRequired,
      organisation: filters.organisation || undefined,
      radiusKm: filters.radiusKm,
      useMyLocation: filters.useMyLocation
    };
  }, [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const timeout = setTimeout(() => {
      const run = async (): Promise<{
        items: FoodBank[];
        focusLocation: UserLocation | null;
      }> => {
        if (derivedFilters.search) {
          const response = await searchFoodbanks({
            q: derivedFilters.search,
            organisation: derivedFilters.organisation,
            limit: 5000
          });

          return {
            items: response.data,
            focusLocation:
              response.meta.center && Number.isFinite(response.meta.center.latitude)
                ? response.meta.center
                : null
          };
        }

        if (derivedFilters.useMyLocation && location) {
          const nearby = await fetchNearbyFoodbanks(
            location.latitude,
            location.longitude,
            derivedFilters.radiusKm,
            {
              open_now: derivedFilters.open_now,
              referral_required: derivedFilters.referral_required,
              organisation: derivedFilters.organisation,
              limit: 5000
            }
          );

          if (nearby.length > 0) {
            return { items: nearby, focusLocation: location };
          }

          const fallback = await fetchFoodbanks({
              page: 1,
              limit: 5000,
              open_now: derivedFilters.open_now,
              referral_required: derivedFilters.referral_required,
              organisation: derivedFilters.organisation
            });

          return { items: fallback.data, focusLocation: location };
        }

        const response = await fetchFoodbanks({
          page: 1,
          limit: 5000,
          open_now: derivedFilters.open_now,
          referral_required: derivedFilters.referral_required,
          organisation: derivedFilters.organisation
        });

        return { items: response.data, focusLocation: null };
      };

      run()
        .then((result) => {
          if (!active) return;
          setData(result.items);
          setFocusLocation(result.focusLocation);
          setError(null);
        })
        .catch((requestError) => {
          if (!active) return;
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load food banks"
          );
          setData([]);
          setFocusLocation(null);
        })
        .finally(() => {
          if (!active) return;
          setLoading(false);
        });
    }, 150);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [derivedFilters, location]);

  return { data, loading, error, focusLocation };
};
