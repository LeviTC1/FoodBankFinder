import L from "leaflet";
import type { ReferralType } from "@foodbankfinder/shared";

const createFoodbankIcon = (iconUrl: string, className: string) =>
  L.icon({
    iconUrl,
    iconRetinaUrl: iconUrl,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    className
  });

const referralIcons: Record<ReferralType, { open: L.Icon; closed: L.Icon }> = {
  none: {
    open: createFoodbankIcon(
      "/icons/foodbank-referral-none.svg",
      "foodbank-marker-icon foodbank-marker-icon--none"
    ),
    closed: createFoodbankIcon(
      "/icons/foodbank-referral-none.svg",
      "foodbank-marker-icon foodbank-marker-icon--none foodbank-marker-icon--dim"
    )
  },
  soft: {
    open: createFoodbankIcon(
      "/icons/foodbank-referral-soft.svg",
      "foodbank-marker-icon foodbank-marker-icon--soft"
    ),
    closed: createFoodbankIcon(
      "/icons/foodbank-referral-soft.svg",
      "foodbank-marker-icon foodbank-marker-icon--soft foodbank-marker-icon--dim"
    )
  },
  required: {
    open: createFoodbankIcon(
      "/icons/foodbank-referral-required.svg",
      "foodbank-marker-icon foodbank-marker-icon--required"
    ),
    closed: createFoodbankIcon(
      "/icons/foodbank-referral-required.svg",
      "foodbank-marker-icon foodbank-marker-icon--required foodbank-marker-icon--dim"
    )
  },
  unknown: {
    open: createFoodbankIcon(
      "/icons/foodbank-referral-unknown.svg",
      "foodbank-marker-icon foodbank-marker-icon--unknown"
    ),
    closed: createFoodbankIcon(
      "/icons/foodbank-referral-unknown.svg",
      "foodbank-marker-icon foodbank-marker-icon--unknown foodbank-marker-icon--dim"
    )
  }
};

const normalizeReferralType = (value?: ReferralType | null): ReferralType => {
  if (value === "required" || value === "soft" || value === "none" || value === "unknown") {
    return value;
  }
  return "unknown";
};

export const getFoodbankIcon = (
  referralType?: ReferralType | null,
  openNow?: boolean | null
) => {
  const normalized = normalizeReferralType(referralType);
  if (openNow === false) return referralIcons[normalized].closed;
  return referralIcons[normalized].open;
};
