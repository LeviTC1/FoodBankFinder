import type { ReferralType } from "@foodbankfinder/shared";

const requiredPattern =
  /\b(referral (voucher )?(required|needed)|voucher required|must be referred|referral only|professionals? referral)\b/i;

const softPattern =
  /\b(soft referral|case[- ]by[- ]case|discretion|referral suggested|referral preferred|usually referral)\b/i;

const nonePattern =
  /\b(no referral (needed|required)?|without referral|walk[- ]?in|anyone can attend|open to all|self[- ]?referral)\b/i;

const isReferralType = (value: unknown): value is ReferralType =>
  value === "required" || value === "soft" || value === "none" || value === "unknown";

export const normalizeReferralType = (value?: string | null): ReferralType => {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase();
  return isReferralType(normalized) ? normalized : "unknown";
};

export const inferReferralTypeFromText = (value?: string | null): ReferralType => {
  if (!value) return "unknown";

  if (requiredPattern.test(value)) return "required";
  if (nonePattern.test(value)) return "none";
  if (softPattern.test(value)) return "soft";
  return "unknown";
};

export interface InferReferralTypeInput {
  explicitType?: string | null;
  referralRequired?: boolean | null;
  texts?: Array<string | null | undefined>;
}

export const inferReferralType = (input: InferReferralTypeInput): ReferralType => {
  const explicit = normalizeReferralType(input.explicitType);
  if (explicit !== "unknown") {
    return explicit;
  }

  const texts = input.texts ?? [];
  let hasSoft = false;
  let hasNone = false;

  for (const value of texts) {
    const inferred = inferReferralTypeFromText(value);
    if (inferred === "required") return "required";
    if (inferred === "none") hasNone = true;
    if (inferred === "soft") hasSoft = true;
  }

  if (hasNone) return "none";
  if (hasSoft) return "soft";

  if (input.referralRequired === true) return "required";
  if (input.referralRequired === false) return "none";

  return "unknown";
};

export const referralTypeToRequired = (referralType?: ReferralType | null): boolean | null => {
  if (referralType === "required") return true;
  if (referralType === "none") return false;
  return null;
};

export const referralAccessibilityRank = (referralType?: ReferralType | null): number => {
  switch (referralType) {
    case "none":
      return 0;
    case "soft":
      return 1;
    case "required":
      return 2;
    default:
      return 3;
  }
};
