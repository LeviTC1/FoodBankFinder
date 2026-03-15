import type { ReferralType } from "@foodbankfinder/shared";

interface ReferralBadgeProps {
  referralType?: ReferralType | null;
  className?: string;
}

const normalizeReferralType = (value?: ReferralType | null): ReferralType => {
  if (value === "required" || value === "soft" || value === "none" || value === "unknown") {
    return value;
  }
  return "unknown";
};

const styleByType: Record<ReferralType, string> = {
  required: "border-[#f0c3c3] bg-[#fff1f1] text-[#9b3d3d]",
  soft: "border-[#efd9a8] bg-[#fff8e8] text-[#8b620d]",
  none: "border-[#b8dbc7] bg-[#e8f5ed] text-[#2f7d4f]",
  unknown: "border-[#d9ded9] bg-[#f2f4f2] text-[#5e6a5e]"
};

const labelByType: Record<ReferralType, string> = {
  required: "Referral required",
  soft: "Soft referral",
  none: "No referral needed",
  unknown: "Referral status unknown"
};

export const ReferralBadge = ({ referralType, className = "" }: ReferralBadgeProps) => {
  const normalized = normalizeReferralType(referralType);

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styleByType[normalized]} ${className}`.trim()}
    >
      {labelByType[normalized]}
    </span>
  );
};
