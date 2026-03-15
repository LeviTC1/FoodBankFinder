import {
  Box,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  Phone,
  X
} from "lucide-react";
import type { FoodBank } from "@foodbankfinder/shared";
import { GlassCard } from "./GlassCard";
import { ReferralBadge } from "./ReferralBadge";

interface FoodBankDetailPanelProps {
  selected: FoodBank | null;
  totalCount: number;
  onClose?: () => void;
}

const toDirectionsUrl = (foodBank: FoodBank): string => {
  if (foodBank.latitude != null && foodBank.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${foodBank.latitude},${foodBank.longitude}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${foodBank.name} ${foodBank.address ?? ""}`
  )}`;
};

export const FoodBankDetailPanel = ({
  selected,
  totalCount,
  onClose
}: FoodBankDetailPanelProps) => {
  if (!selected) {
    return (
      <GlassCard className="space-y-2">
        <h2 className="text-base font-semibold text-[#1f6b3f]">Food bank details</h2>
        <p className="text-sm text-[#495249]">
          Select a location on the map to see opening times, contact details, and referral guidance.
        </p>
        <p className="rounded-xl border border-[#d8e7dd] bg-[#eef8f1] px-3 py-2 text-sm text-[#2f7d4f]">
          {totalCount.toLocaleString()} locations currently visible
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[#1f6b3f]">{selected.name}</h2>
          <p className="text-sm text-[#4a544a]">{selected.organisation ?? "Community food support service"}</p>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
              selected.open_now
                ? "border-[#b6d8c3] bg-[#e8f5ed] text-[#2f7d4f]"
                : "border-[#d6dbd6] bg-[#f0f2f0] text-[#536053]"
            }`}
          >
            {selected.open_now ? "Open now" : "Currently closed"}
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d2d8d2] bg-white p-1.5 text-[#4a544a] transition hover:border-[#4f9b7a] hover:text-[#2f7d4f]"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-3 text-sm text-[#3f4b3f]">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 text-[#4f9b7a]" aria-hidden="true" />
          <span>{selected.address ?? "Address currently unavailable"}</span>
        </p>

        <p className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-[#4f9b7a]" aria-hidden="true" />
          {selected.phone ? (
            <a href={`tel:${selected.phone}`} className="font-medium text-[#2f7d4f] hover:underline">
              {selected.phone}
            </a>
          ) : (
            <span className="text-[#6a756a]">Phone currently unavailable</span>
          )}
        </p>

        <p className="flex items-start gap-2">
          <Clock3 className="mt-0.5 h-4 w-4 text-[#4f9b7a]" aria-hidden="true" />
          <span>{selected.opening_hours ?? "Please contact directly to confirm opening times"}</span>
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p className="inline-flex items-center gap-2 font-medium text-[#3f4b3f]">
          <Box className="h-4 w-4 text-[#4f9b7a]" aria-hidden="true" />
          Services available
        </p>
        {selected.services && selected.services.length > 0 ? (
          <ul className="space-y-1 text-[#2f3930]">
            {selected.services.map((service) => (
              <li key={service} className="rounded-lg border border-[#e4e7e4] bg-[#fbfcfb] px-2 py-1">
                {service}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#6a756a]">Service details are being updated.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#5a675a]">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Referral requirement
        </p>
        <ReferralBadge referralType={selected.referral_type} />
      </div>

      {selected.ai_summary && (
        <p className="rounded-xl border border-[#e4e7e4] bg-[#fbfcfb] px-3 py-2 text-sm text-[#425042]">
          {selected.ai_summary}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <a
          href={toDirectionsUrl(selected)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#2f7d4f] bg-[#2f7d4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#266741]"
        >
          Directions
        </a>

        {selected.phone && (
          <a
            href={`tel:${selected.phone}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cdd6cd] bg-white px-4 py-2.5 text-sm font-semibold text-[#2f7d4f] transition hover:border-[#4f9b7a]"
          >
            Call
          </a>
        )}

        {selected.website && (
          <a
            href={selected.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cdd6cd] bg-white px-4 py-2.5 text-sm font-semibold text-[#2f7d4f] transition hover:border-[#4f9b7a]"
          >
            Website
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </GlassCard>
  );
};
