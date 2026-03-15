import Fuse from "fuse.js";
import type { FoodBank, SourceName } from "@foodbankfinder/shared";
import { parseOpeningHours } from "../utils/parseOpeningHours.js";
import {
  inferReferralType,
  referralTypeToRequired
} from "../utils/referralType.js";

export interface NormalizedFoodBank extends FoodBank {
  normalized_hash: string;
}

const sanitize = (value?: string | null): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned : null;
};

const normalizePostcode = (postcode?: string | null): string | null => {
  const cleaned = sanitize(postcode)?.toUpperCase().replace(/\s+/g, "") ?? null;
  if (!cleaned) return null;
  if (cleaned.length < 5) return cleaned;
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
};

const normalizePhone = (phone?: string | null): string | null => {
  const cleaned = sanitize(phone);
  if (!cleaned) return null;
  return cleaned.replace(/[^\d+()\-\s]/g, "");
};

const normalizeEmail = (email?: string | null): string | null => {
  const cleaned = sanitize(email)?.toLowerCase() ?? null;
  if (!cleaned) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
};

const normalizeWebsite = (website?: string | null): string | null => {
  const cleaned = sanitize(website);
  if (!cleaned) return null;
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
  return `https://${cleaned}`;
};

const normalizeCoordinates = (
  latitude?: number | null,
  longitude?: number | null
): { latitude: number | null; longitude: number | null } => {
  if (latitude == null || longitude == null) {
    return { latitude: null, longitude: null };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { latitude: null, longitude: null };
  }

  const plausibleUk = lat >= 49 && lat <= 61 && lng >= -9 && lng <= 3;
  if (!plausibleUk) {
    return { latitude: null, longitude: null };
  }

  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6))
  };
};

const slug = (value?: string | null): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toHash = (
  name: string,
  postcode?: string | null,
  latitude?: number | null,
  longitude?: number | null,
  address?: string | null
): string => {
  const coordKey =
    latitude != null && longitude != null
      ? `${latitude.toFixed(3)}:${longitude.toFixed(3)}`
      : "na";
  return [slug(name), slug(postcode ?? ""), slug(address ?? ""), coordKey].join("|");
};

const mergeRecords = (a: NormalizedFoodBank, b: NormalizedFoodBank): NormalizedFoodBank => ({
  ...a,
  organisation: a.organisation ?? b.organisation,
  address: a.address ?? b.address,
  postcode: a.postcode ?? b.postcode,
  latitude: a.latitude ?? b.latitude,
  longitude: a.longitude ?? b.longitude,
  phone: a.phone ?? b.phone,
  email: a.email ?? b.email,
  website: a.website ?? b.website,
  opening_hours: a.opening_hours ?? b.opening_hours,
  opening_hours_parsed: a.opening_hours_parsed ?? b.opening_hours_parsed,
  referral_required:
    a.referral_required == null ? b.referral_required : a.referral_required,
  referral_type:
    a.referral_type && a.referral_type !== "unknown"
      ? a.referral_type
      : b.referral_type ?? "unknown",
  notes: [a.notes, b.notes].filter(Boolean).join(" | ") || null,
  food_types:
    a.food_types || b.food_types
      ? Array.from(new Set([...(a.food_types ?? []), ...(b.food_types ?? [])]))
      : null,
  baby_supplies:
    a.baby_supplies == null ? b.baby_supplies : a.baby_supplies,
  hygiene_products:
    a.hygiene_products == null ? b.hygiene_products : a.hygiene_products,
  hot_meals: a.hot_meals == null ? b.hot_meals : a.hot_meals
});

export class NormalizationService {
  normalizeRecord(raw: Partial<FoodBank>, source: SourceName): NormalizedFoodBank | null {
    const name = sanitize(raw.name);
    if (!name) return null;

    const postcode = normalizePostcode(raw.postcode);
    const address = sanitize(raw.address);
    const coords = normalizeCoordinates(raw.latitude, raw.longitude);
    const referral_type = inferReferralType({
      explicitType: raw.referral_type,
      referralRequired: raw.referral_required,
      texts: [raw.notes, raw.opening_hours]
    });
    const referral_required = referralTypeToRequired(referral_type);
    const openingHours = sanitize(raw.opening_hours);
    const openingHoursParsed =
      raw.opening_hours_parsed ?? parseOpeningHours(openingHours);

    const normalized: NormalizedFoodBank = {
      name,
      organisation: sanitize(raw.organisation),
      address,
      postcode,
      latitude: coords.latitude,
      longitude: coords.longitude,
      phone: normalizePhone(raw.phone),
      email: normalizeEmail(raw.email),
      website: normalizeWebsite(raw.website),
      opening_hours: openingHours,
      opening_hours_parsed: openingHoursParsed,
      referral_required,
      referral_type,
      notes: sanitize(raw.notes),
      source,
      last_updated: raw.last_updated ?? new Date().toISOString(),
      food_types: raw.food_types ?? null,
      baby_supplies: raw.baby_supplies ?? null,
      hygiene_products: raw.hygiene_products ?? null,
      hot_meals: raw.hot_meals ?? null,
      normalized_hash: toHash(name, postcode, coords.latitude, coords.longitude, address)
    };

    return normalized;
  }

  normalizeBatch(raw: Array<Partial<FoodBank>>, source: SourceName): NormalizedFoodBank[] {
    const normalized = raw
      .map((record) => this.normalizeRecord(record, source))
      .filter((record): record is NormalizedFoodBank => record !== null);

    return this.mergeFuzzyDuplicates(normalized);
  }

  private mergeFuzzyDuplicates(records: NormalizedFoodBank[]): NormalizedFoodBank[] {
    if (records.length < 2) return records;

    const groupedByPostcode = new Map<string, NormalizedFoodBank[]>();
    for (const record of records) {
      const key = record.postcode ?? "NO_POSTCODE";
      const group = groupedByPostcode.get(key) ?? [];
      group.push(record);
      groupedByPostcode.set(key, group);
    }

    const merged: NormalizedFoodBank[] = [];

    for (const group of groupedByPostcode.values()) {
      const taken = new Set<number>();
      const fuse = new Fuse(group, {
        keys: ["name", "organisation"],
        includeScore: true,
        threshold: 0.2
      });

      for (let i = 0; i < group.length; i += 1) {
        if (taken.has(i)) continue;

        let base = group[i];
        const hits = fuse.search(base.name).filter((hit) => {
          const idx = group.findIndex((candidate) => candidate === hit.item);
          return idx >= 0 && idx !== i && !taken.has(idx) && (hit.score ?? 1) < 0.2;
        });

        for (const hit of hits) {
          const idx = group.findIndex((candidate) => candidate === hit.item);
          if (idx >= 0 && !taken.has(idx)) {
            base = mergeRecords(base, group[idx]);
            taken.add(idx);
          }
        }

        taken.add(i);
        merged.push(base);
      }
    }

    return merged;
  }
}
