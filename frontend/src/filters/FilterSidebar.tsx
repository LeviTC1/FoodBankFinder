import { LocateFixed } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import type { UiFilters } from "@/hooks/useFoodBanks";

interface FilterSidebarProps {
  filters: UiFilters;
  organisations: string[];
  geolocationStatus: "idle" | "loading" | "granted" | "denied";
  onChange: (partial: Partial<UiFilters>) => void;
  onRetryLocation: () => void;
}

const radiusOptions = [5, 10, 20, 50];

export const FilterSidebar = ({
  filters,
  organisations,
  geolocationStatus,
  onChange,
  onRetryLocation
}: FilterSidebarProps) => {
  return (
    <GlassCard className="space-y-4">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[#1f6b3f]">Filters</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({ openToday: !filters.openToday })}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              filters.openToday
                ? "border-[#2f7d4f] bg-[#e8f5ed] text-[#2f7d4f]"
                : "border-[#d7ddd7] bg-white text-[#495249] hover:border-[#b8c5b8]"
            }`}
          >
            Open today
          </button>

          <button
            type="button"
            onClick={() =>
              onChange({
                referral: filters.referral === "no_referral" ? "any" : "no_referral"
              })
            }
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              filters.referral === "no_referral"
                ? "border-[#2f7d4f] bg-[#e8f5ed] text-[#2f7d4f]"
                : "border-[#d7ddd7] bg-white text-[#495249] hover:border-[#b8c5b8]"
            }`}
          >
            Walk-in support
          </button>

          <button
            type="button"
            onClick={() =>
              onChange({
                referral: filters.referral === "no_referral" ? "any" : "no_referral"
              })
            }
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              filters.referral === "no_referral"
                ? "border-[#2f7d4f] bg-[#e8f5ed] text-[#2f7d4f]"
                : "border-[#d7ddd7] bg-white text-[#495249] hover:border-[#b8c5b8]"
            }`}
          >
            No referral needed
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-[#1f6b3f]">Referral requirement</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "any", label: "Any" },
            { key: "no_referral", label: "No referral needed" },
            { key: "required", label: "Referral required" }
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange({ referral: option.key as UiFilters["referral"] })}
              className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                filters.referral === option.key
                  ? "border-[#2f7d4f] bg-[#e8f5ed] text-[#2f7d4f]"
                  : "border-[#d7ddd7] bg-white text-[#4d574d] hover:border-[#b8c5b8]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-[#1f6b3f]">Distance</p>
        <div className="flex flex-wrap gap-2">
          {radiusOptions.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => onChange({ radiusKm: km })}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                filters.radiusKm === km
                  ? "border-[#2f7d4f] bg-[#e8f5ed] text-[#2f7d4f]"
                  : "border-[#d7ddd7] bg-white text-[#4d574d] hover:border-[#b8c5b8]"
              }`}
            >
              {km} km
            </button>
          ))}
        </div>
      </section>

      <details className="rounded-xl border border-[#e4e7e4] bg-[#fbfdfb] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#2f7d4f]">More filters</summary>

        <div className="mt-3 space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[#3c463c]">Organisation</span>
            <select
              value={filters.organisation}
              onChange={(event) => onChange({ organisation: event.target.value })}
              className="w-full rounded-xl border border-[#d7ddd7] bg-white px-3 py-2 text-sm text-[#2b2b2b] outline-none transition focus:border-[#4f9b7a]"
            >
              <option value="">All organisations</option>
              {organisations.map((organisation) => (
                <option key={organisation} value={organisation}>
                  {organisation}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-[#e4e7e4] bg-white p-3">
            <button
              type="button"
              onClick={() => onChange({ useMyLocation: !filters.useMyLocation })}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                filters.useMyLocation
                  ? "border-[#2f7d4f] bg-[#e8f5ed] text-[#2f7d4f]"
                  : "border-[#d7ddd7] bg-white text-[#3f4a3f]"
              }`}
            >
              <span className="flex items-center gap-2">
                <LocateFixed className="h-4 w-4" />
                Use my current location
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide">{geolocationStatus}</span>
            </button>

            {geolocationStatus === "denied" && (
              <button
                type="button"
                onClick={onRetryLocation}
                className="mt-2 w-full rounded-lg border border-[#4f9b7a] bg-[#e8f5ed] px-2 py-2 text-xs font-semibold text-[#2f7d4f] transition hover:brightness-95"
              >
                Retry location permission
              </button>
            )}
          </div>
        </div>
      </details>
    </GlassCard>
  );
};
