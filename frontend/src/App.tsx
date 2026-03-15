import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { FoodBank, FoodBankStats } from "@foodbankfinder/shared";
import {
  ArrowLeft,
  FileText,
  HeartHandshake,
  LoaderCircle,
  PhoneCall,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { fetchFoodbankStats, fetchOrganisations } from "@/api/foodbanks";
import { FoodBankDetailPanel } from "@/components/FoodBankDetailPanel";
import { GlassCard } from "@/components/GlassCard";
import { FilterSidebar } from "@/filters/FilterSidebar";
import { useFoodBanks, type UiFilters } from "@/hooks/useFoodBanks";
import { useUserLocation } from "@/hooks/useUserLocation";
import { FoodBankMap } from "@/map/FoodBankMap";

const initialFilters: UiFilters = {
  search: "",
  openToday: false,
  referral: "any",
  radiusKm: 20,
  organisation: "",
  useMyLocation: false
};

const normalizePath = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
};

const App = () => {
  const currentPath = useMemo(
    () => normalizePath(typeof window !== "undefined" ? window.location.pathname : "/"),
    []
  );

  const [filters, setFilters] = useState<UiFilters>(initialFilters);
  const [selectedFoodBank, setSelectedFoodBank] = useState<FoodBank | null>(null);
  const [organisations, setOrganisations] = useState<string[]>([]);
  const [stats, setStats] = useState<FoodBankStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [focusLocation, setFocusLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const userLocation = useUserLocation();
  const {
    data,
    loading,
    error,
    focusLocation: searchFocusLocation
  } = useFoodBanks(filters, userLocation.location);

  useEffect(() => {
    if (searchFocusLocation) {
      setFocusLocation(searchFocusLocation);
    }
  }, [searchFocusLocation]);

  useEffect(() => {
    fetchOrganisations().then(setOrganisations).catch(() => setOrganisations([]));
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    fetchFoodbankStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedFoodBank?.id) return;
    const stillExists = data.some((foodBank) => foodBank.id === selectedFoodBank.id);
    if (!stillExists) {
      setSelectedFoodBank(null);
    }
  }, [data, selectedFoodBank]);

  const handleFilterChange = (partial: Partial<UiFilters>) => {
    if (partial.referral && partial.referral !== "any") {
      window.dispatchEvent(
        new CustomEvent("filter_referral_used", {
          detail: {
            referral: partial.referral
          }
        })
      );

      const analyticsWindow = window as Window & {
        gtag?: (...args: unknown[]) => void;
      };
      analyticsWindow.gtag?.("event", "filter_referral_used", {
        referral: partial.referral
      });
    }

    setFilters((prev) => ({ ...prev, ...partial }));

    if (partial.useMyLocation === true) {
      void userLocation.requestLocation();
    }
  };

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = filters.search.trim();
    if (query) {
      handleFilterChange({ search: query, useMyLocation: false });
      return;
    }

    await handleUseCurrentLocation();
  };

  const handleUseCurrentLocation = async () => {
    const location = await userLocation.requestLocation();
    if (location) {
      setFocusLocation(location);
      handleFilterChange({ useMyLocation: true });
    }
  };

  const sidebarProps = {
    filters,
    organisations,
    geolocationStatus: userLocation.status,
    onChange: handleFilterChange,
    onRetryLocation: () => {
      void userLocation.requestLocation();
    }
  } as const;

  const appFooter = (
    <footer>
      <GlassCard className="space-y-3">
        <p className="text-base font-semibold text-[#1f6b3f]">FoodBankFinder</p>
        <p className="text-sm text-[#4a544a]">
          FoodBankFinder helps people locate food support across the UK.
        </p>
        <p className="text-sm text-[#4a544a]">
          This site is not affiliated with any single food bank network.
        </p>
        <p className="text-sm text-[#4a544a]">
          Always contact the organisation directly to confirm opening times and referral
          requirements.
        </p>
        <nav className="flex flex-wrap gap-4 text-sm">
          <a href="/about-data" className="text-[#2f7d4f] hover:text-[#235f3c] hover:underline">
            About the data
          </a>
          <a href="/data-sources" className="text-[#2f7d4f] hover:text-[#235f3c] hover:underline">
            Data sources
          </a>
          <a href="/accessibility" className="text-[#2f7d4f] hover:text-[#235f3c] hover:underline">
            Accessibility
          </a>
          <a href="/privacy" className="text-[#2f7d4f] hover:text-[#235f3c] hover:underline">
            Privacy
          </a>
        </nav>
      </GlassCard>
    </footer>
  );

  if (currentPath !== "/") {
    return (
      <div className="app-shell min-h-screen text-[#2b2b2b]">
        <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col gap-4 p-4">
          <header>
            <GlassCard className="space-y-2">
              <a
                href="/"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#2f7d4f] hover:text-[#235f3c]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to map
              </a>
              <h1 className="text-3xl font-semibold text-[#1f6b3f]">
                {currentPath === "/about-data" && "About the data"}
                {currentPath === "/data-sources" && "Data sources"}
                {currentPath === "/accessibility" && "Accessibility"}
                {currentPath === "/privacy" && "Privacy"}
              </h1>
            </GlassCard>
          </header>

          {currentPath === "/about-data" && (
            <GlassCard className="space-y-3 text-sm text-[#415041]">
              <p>
                FoodBankFinder combines open charity directories and publicly available data to make
                food support easier to find.
              </p>
              {statsLoading && (
                <p className="inline-flex items-center gap-2 text-[#4a544a]">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading dataset overview...
                </p>
              )}
              {stats && (
                <>
                  <p>
                    Food banks mapped: <strong>{stats.total_foodbanks.toLocaleString()}</strong>
                  </p>
                  <p>
                    Average distance to support:{" "}
                    <strong>
                      {(
                        stats.average_distance_km ??
                        stats.average_coverage_distance_km ??
                        0
                      ).toFixed(2)}{" "}
                      km
                    </strong>
                  </p>
                  <p>
                    Areas with limited support: <strong>{(stats.coverage_gaps_detected ?? 0).toLocaleString()}</strong>
                  </p>
                </>
              )}
            </GlassCard>
          )}

          {currentPath === "/data-sources" && (
            <GlassCard className="space-y-2 text-sm text-[#415041]">
              <p>GiveFood</p>
              <p>Independent Food Aid Network (IFAN)</p>
              <p>OpenStreetMap</p>
              <p>Additional publicly available charity and local directory data.</p>
            </GlassCard>
          )}

          {currentPath === "/accessibility" && (
            <GlassCard className="space-y-2 text-sm text-[#415041]">
              <p>
                We aim to provide clear language, readable text, high contrast, keyboard-accessible
                controls, and mobile-friendly layouts.
              </p>
              <p>If you spot an accessibility issue, please report it so we can fix it quickly.</p>
            </GlassCard>
          )}

          {currentPath === "/privacy" && (
            <GlassCard className="space-y-2 text-sm text-[#415041]">
              <p>
                FoodBankFinder does not require an account to search for support. If you allow
                location access, it is used only to help find nearby support.
              </p>
              <p>
                Always review your browser privacy settings and contact us if you need more details.
              </p>
            </GlassCard>
          )}

          {appFooter}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col gap-4 p-4">
        <header>
          <GlassCard className="space-y-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#2f7d4f]">
              <HeartHandshake className="h-4 w-4" />
              FoodBankFinder
            </p>

            <h1 className="text-3xl font-semibold text-[#1f6b3f] sm:text-4xl">
              Find food support near you
            </h1>

            <p className="max-w-3xl text-base text-[#495249]">
              If you're struggling to afford food, local food banks and community support services
              may be able to help today.
            </p>

            <form onSubmit={handleSearchSubmit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#4f9b7a]" />
                <input
                  value={filters.search}
                  onChange={(event) => handleFilterChange({ search: event.target.value })}
                  placeholder="Enter postcode or town"
                  className="h-12 w-full rounded-xl border border-[#d2d8d2] bg-white pl-12 pr-4 text-base text-[#2b2b2b] outline-none transition focus:border-[#4f9b7a]"
                />
              </label>

              <button
                type="submit"
                className="h-12 rounded-xl border border-[#2f7d4f] bg-[#2f7d4f] px-4 text-base font-semibold text-white transition hover:bg-[#266741]"
              >
                Find food near me
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="rounded-xl border border-[#c7d3c7] bg-white px-4 py-2.5 text-sm font-semibold text-[#2f7d4f] transition hover:border-[#4f9b7a]"
              >
                Use my current location
              </button>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#c7d3c7] bg-white px-4 py-2.5 text-sm font-semibold text-[#2f7d4f] transition hover:border-[#4f9b7a] lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>

              <p className="text-sm text-[#4d574d]">
                {loading ? "Loading locations..." : `${data.length.toLocaleString()} locations found`}
              </p>
            </div>
          </GlassCard>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="hidden lg:block">
            <FilterSidebar {...sidebarProps} />

            {error && (
              <div className="mt-3 rounded-xl border border-[#efcaca] bg-[#fff3f3] px-3 py-2 text-sm text-[#8a3f3f]">
                {error}
              </div>
            )}
            {userLocation.error && (
              <div className="mt-3 rounded-xl border border-[#eed8a8] bg-[#fff8e8] px-3 py-2 text-sm text-[#7f5b11]">
                {userLocation.error}
              </div>
            )}
          </aside>

          <main className="space-y-4">
            <GlassCard className="space-y-3 p-3 sm:p-4">
              <p className="rounded-xl border border-[#d9e4da] bg-[#f4faf6] px-3 py-2 text-sm text-[#3f4c3f]">
                Tap a location to view opening times, contact details and referral guidance.
              </p>

              {loading && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-[#d5ddd5] bg-white px-3 py-2 text-sm text-[#4b584b]">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading food bank locations...
                </div>
              )}

              {(error || userLocation.error) && (
                <div className="space-y-2 lg:hidden">
                  {error && (
                    <div className="rounded-xl border border-[#efcaca] bg-[#fff3f3] px-3 py-2 text-sm text-[#8a3f3f]">
                      {error}
                    </div>
                  )}
                  {userLocation.error && (
                    <div className="rounded-xl border border-[#eed8a8] bg-[#fff8e8] px-3 py-2 text-sm text-[#7f5b11]">
                      {userLocation.error}
                    </div>
                  )}
                </div>
              )}

              <div className="min-h-[52vh] lg:h-[68vh]">
                <FoodBankMap
                  foodBanks={data}
                  coverageCells={[]}
                  layer="foodbanks"
                  selectedId={selectedFoodBank?.id ? String(selectedFoodBank.id) : undefined}
                  userLocation={userLocation.location}
                  focusLocation={focusLocation}
                  onSelect={setSelectedFoodBank}
                />
              </div>
            </GlassCard>

            <section id="how-food-banks-work">
              <GlassCard className="space-y-3">
                <h2 className="text-xl font-semibold text-[#1f6b3f]">How food banks work</h2>
                <div className="grid gap-2 text-sm text-[#425042] sm:grid-cols-2">
                  <p className="flex items-start gap-2 rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">
                    <Search className="mt-0.5 h-4 w-4 text-[#2f7d4f]" />
                    Find a food bank near you
                  </p>
                  <p className="flex items-start gap-2 rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">
                    <FileText className="mt-0.5 h-4 w-4 text-[#2f7d4f]" />
                    Check whether a referral is needed
                  </p>
                  <p className="flex items-start gap-2 rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">
                    <PhoneCall className="mt-0.5 h-4 w-4 text-[#2f7d4f]" />
                    Contact the organisation or visit during opening hours
                  </p>
                  <p className="flex items-start gap-2 rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">
                    <HeartHandshake className="mt-0.5 h-4 w-4 text-[#2f7d4f]" />
                    They will help provide emergency food support
                  </p>
                </div>
              </GlassCard>
            </section>
          </main>

          <aside className="space-y-3">
            <FoodBankDetailPanel
              selected={selectedFoodBank}
              totalCount={data.length}
              onClose={() => setSelectedFoodBank(null)}
            />
          </aside>
        </div>

        <section id="data-sources">
          <GlassCard className="space-y-2">
            <h2 className="text-lg font-semibold text-[#1f6b3f]">Data sources</h2>
            <p className="text-sm text-[#4a544a]">
              We combine open datasets and publicly available charity directories to help you find
              support quickly.
            </p>
            <div className="grid gap-2 text-sm text-[#3e4b3e] sm:grid-cols-3">
              <p className="rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">GiveFood</p>
              <p className="rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">
                Independent Food Aid Network
              </p>
              <p className="rounded-xl border border-[#e4e7e4] bg-white px-3 py-2">OpenStreetMap</p>
            </div>
          </GlassCard>
        </section>

        {appFooter}
      </div>

      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/25 lg:hidden"
          onClick={() => setMobileFiltersOpen(false)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute bottom-0 left-0 right-0 max-h-[86vh] overflow-y-auto rounded-t-3xl border-t border-[#d8ded8] bg-[#f6f8f6] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1f6b3f]">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-lg border border-[#ccd4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#2f7d4f]"
              >
                Close
              </button>
            </div>

            <FilterSidebar {...sidebarProps} />

            {error && (
              <div className="mt-3 rounded-xl border border-[#efcaca] bg-[#fff3f3] px-3 py-2 text-sm text-[#8a3f3f]">
                {error}
              </div>
            )}
            {userLocation.error && (
              <div className="mt-3 rounded-xl border border-[#eed8a8] bg-[#fff8e8] px-3 py-2 text-sm text-[#7f5b11]">
                {userLocation.error}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default App;
