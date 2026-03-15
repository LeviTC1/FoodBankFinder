import { fileURLToPath } from "node:url";
import axios from "axios";
import { z } from "zod";
import type { FoodBank } from "@foodbankfinder/shared";
import { config } from "../config.js";
import { withClient, pool } from "../database/pool.js";
import { NormalizationService, type NormalizedFoodBank } from "../services/normalizationService.js";
import { logger } from "../utils/logger.js";
import {
  inferReferralType,
  referralTypeToRequired
} from "../utils/referralType.js";

const giveFoodUrlsSchema = z
  .object({
    self: z.string().url().optional(),
    html: z.string().url().optional(),
    homepage: z.string().url().or(z.literal("")).optional()
  })
  .partial()
  .optional();

const giveFoodPoliticsSchema = z
  .object({
    district: z.string().nullable().optional()
  })
  .partial()
  .optional();

const giveFoodSummarySchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    slug: z.string().optional(),
    phone: z.string().nullable().optional(),
    secondary_phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    postcode: z.string().nullable().optional(),
    lat_lng: z.string().nullable().optional(),
    network: z.string().nullable().optional(),
    closed: z.boolean().optional(),
    urls: giveFoodUrlsSchema,
    politics: giveFoodPoliticsSchema
  })
  .passthrough();

const giveFoodLocationSchema = z
  .object({
    name: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    postcode: z.string().nullable().optional(),
    lat_lng: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    opening_hours: z.string().nullable().optional(),
    politics: giveFoodPoliticsSchema
  })
  .passthrough();

const giveFoodNeedSchema = z
  .object({
    needs: z.string().optional()
  })
  .partial()
  .optional();

const giveFoodDetailSchema = giveFoodSummarySchema.extend({
  locations: z.array(giveFoodLocationSchema).optional(),
  need: giveFoodNeedSchema
});

interface GiveFoodIngestionResult {
  source: "givefood";
  fetched_foodbanks: number;
  expanded_locations: number;
  normalized_records: number;
  inserted_records: number;
  finished_at: string;
  duration_ms: number;
}

const sanitize = (value?: string | null): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\u202f/g, " ")
    .replace(/\u2009/g, " ")
    .replace(/\r\n/g, ", ")
    .replace(/\r/g, ", ")
    .replace(/\n/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length ? cleaned : null;
};

const parseLatLng = (
  input?: string | null
): { latitude: number | null; longitude: number | null } => {
  if (!input) {
    return { latitude: null, longitude: null };
  }

  const [latValue, lngValue] = input.split(",");
  const latitude = Number(latValue);
  const longitude = Number(lngValue);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude: null, longitude: null };
  }

  return { latitude, longitude };
};

const mergeRecords = (
  existing: NormalizedFoodBank,
  incoming: NormalizedFoodBank
): NormalizedFoodBank => ({
  ...existing,
  organisation: existing.organisation ?? incoming.organisation,
  address: existing.address ?? incoming.address,
  latitude: existing.latitude ?? incoming.latitude,
  longitude: existing.longitude ?? incoming.longitude,
  phone: existing.phone ?? incoming.phone,
  email: existing.email ?? incoming.email,
  website: existing.website ?? incoming.website,
  opening_hours: existing.opening_hours ?? incoming.opening_hours,
  opening_hours_parsed: existing.opening_hours_parsed ?? incoming.opening_hours_parsed,
  referral_required:
    existing.referral_required == null
      ? incoming.referral_required
      : existing.referral_required,
  referral_type:
    existing.referral_type && existing.referral_type !== "unknown"
      ? existing.referral_type
      : incoming.referral_type ?? "unknown",
  notes: [existing.notes, incoming.notes].filter(Boolean).join(" | ") || null
});

const dedupeByNameAndPostcode = (
  records: NormalizedFoodBank[]
): NormalizedFoodBank[] => {
  const deduped = new Map<string, NormalizedFoodBank>();

  for (const record of records) {
    const postcodeKey = (record.postcode ?? "").replace(/\s+/g, "").toUpperCase();
    const coordinateKey =
      record.latitude != null && record.longitude != null
        ? `${record.latitude.toFixed(3)}:${record.longitude.toFixed(3)}`
        : "na";
    const key = `${record.name.toLowerCase()}|${postcodeKey || coordinateKey}`;

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, record);
      continue;
    }

    deduped.set(key, mergeRecords(existing, record));
  }

  return Array.from(deduped.values());
};

const mapBaseRecord = (
  detail: z.infer<typeof giveFoodDetailSchema>
): Partial<FoodBank> => {
  const coords = parseLatLng(detail.lat_lng ?? null);
  const district = sanitize(detail.politics?.district ?? null);
  const needs = sanitize(detail.need?.needs);
  const referralType = inferReferralType({
    texts: [needs]
  });

  return {
    name: sanitize(detail.name) ?? "Unknown Food Bank",
    organisation: sanitize(detail.network) ?? "Independent",
    address: sanitize(detail.address),
    postcode: sanitize(detail.postcode),
    latitude: coords.latitude,
    longitude: coords.longitude,
    phone: sanitize(detail.phone) ?? sanitize(detail.secondary_phone),
    email: sanitize(detail.email),
    website:
      sanitize(detail.urls?.homepage) ??
      sanitize(detail.urls?.html) ??
      null,
    opening_hours: null,
    referral_required: referralTypeToRequired(referralType),
    referral_type: referralType,
    notes: [district ? `District: ${district}` : null, needs].filter(Boolean).join(" | ") || null,
    source: "givefood"
  };
};

const mapLocationRecord = (
  detail: z.infer<typeof giveFoodDetailSchema>,
  location: z.infer<typeof giveFoodLocationSchema>
): Partial<FoodBank> => {
  const coords = parseLatLng(location.lat_lng ?? null);
  const parentName = sanitize(detail.name) ?? "Food Bank";
  const locationName = sanitize(location.name);
  const district = sanitize(location.politics?.district ?? detail.politics?.district ?? null);
  const needs = sanitize(detail.need?.needs);
  const referralType = inferReferralType({
    texts: [needs]
  });

  const combinedName =
    locationName && locationName.toLowerCase() !== parentName.toLowerCase()
      ? `${parentName} - ${locationName}`
      : parentName;

  return {
    name: combinedName,
    organisation: sanitize(detail.network) ?? "Independent",
    address: sanitize(location.address) ?? sanitize(detail.address),
    postcode: sanitize(location.postcode) ?? sanitize(detail.postcode),
    latitude: coords.latitude,
    longitude: coords.longitude,
    phone: sanitize(location.phone) ?? sanitize(detail.phone) ?? sanitize(detail.secondary_phone),
    email: sanitize(location.email) ?? sanitize(detail.email),
    website:
      sanitize(location.url) ??
      sanitize(detail.urls?.homepage) ??
      sanitize(detail.urls?.html) ??
      null,
    opening_hours: sanitize(location.opening_hours),
    referral_required: referralTypeToRequired(referralType),
    referral_type: referralType,
    notes: [district ? `District: ${district}` : null, needs].filter(Boolean).join(" | ") || null,
    source: "givefood"
  };
};

const runConcurrently = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (!items.length) return [];

  const output = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        output[index] = await worker(items[index], index);
      }
    })
  );

  return output;
};

const insertBatch = async (records: NormalizedFoodBank[]): Promise<number> => {
  if (!records.length) return 0;

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query("TRUNCATE TABLE foodbanks RESTART IDENTITY");

      const chunkSize = 250;
      let inserted = 0;

      for (let chunkStart = 0; chunkStart < records.length; chunkStart += chunkSize) {
        const chunk = records.slice(chunkStart, chunkStart + chunkSize);
        const params: Array<string | number | boolean | null> = [];
        const rows: string[] = [];

        chunk.forEach((record, rowIndex) => {
          const offset = rowIndex * 15;
          const p = (position: number) => `$${offset + position}`;

          rows.push(`(
            ${p(1)},
            ${p(2)},
            ${p(3)},
            ${p(4)},
            ${p(5)},
            ${p(6)},
            CASE WHEN ${p(5)}::double precision IS NOT NULL AND ${p(6)}::double precision IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(${p(6)}, ${p(5)}), 4326)::geography
              ELSE NULL
            END,
            ${p(7)},
            ${p(8)},
            ${p(9)},
            ${p(10)},
            ${p(11)}::jsonb,
            ${p(12)},
            ${p(13)},
            ${p(14)},
            ${p(15)},
            NOW(),
            NOW()
          )`);

          params.push(
            record.name,
            record.organisation ?? null,
            record.address ?? null,
            record.postcode ?? null,
            record.latitude ?? null,
            record.longitude ?? null,
            record.phone ?? null,
            record.email ?? null,
            record.website ?? null,
            record.opening_hours ?? null,
            record.opening_hours_parsed ? JSON.stringify(record.opening_hours_parsed) : null,
            record.referral_required ?? null,
            record.notes ?? null,
            record.source,
            record.referral_type ?? "unknown"
          );
        });

        const sql = `
          INSERT INTO foodbanks (
            name,
            organisation,
            address,
            postcode,
            latitude,
            longitude,
            geom,
            phone,
            email,
            website,
            opening_hours,
            opening_hours_parsed,
            referral_required,
            notes,
            source,
            referral_type,
            created_at,
            updated_at
          )
          VALUES ${rows.join(",")}
        `;

        await client.query(sql, params);
        inserted += chunk.length;
      }

      await client.query("COMMIT");
      return inserted;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
};

export const runGiveFoodIngestion = async (): Promise<GiveFoodIngestionResult> => {
  const startedAt = Date.now();
  logger.info({ url: config.giveFoodApiUrl }, "Starting GiveFood national ingestion");

  const normalizer = new NormalizationService();

  const listResponse = await axios.get(config.giveFoodApiUrl, { timeout: 60_000 });
  const listData = z.array(giveFoodSummarySchema).parse(listResponse.data);

  const openFoodbanks = listData.filter((item) => item.closed !== true);

  const details = await runConcurrently(openFoodbanks, 15, async (item) => {
    const detailUrl =
      item.urls?.self ??
      (item.slug
        ? `https://www.givefood.org.uk/api/2/foodbank/${item.slug}/`
        : null);

    if (!detailUrl) {
      return {
        detail: giveFoodDetailSchema.parse({
          ...item,
          locations: []
        }),
        hadDetailFetchError: true
      };
    }

    try {
      const response = await axios.get(detailUrl, { timeout: 45_000 });
      return {
        detail: giveFoodDetailSchema.parse(response.data),
        hadDetailFetchError: false
      };
    } catch (error) {
      logger.warn(
        { foodbank: item.name, err: error },
        "Failed to fetch detailed GiveFood record; using summary fallback"
      );

      return {
        detail: giveFoodDetailSchema.parse({
          ...item,
          locations: []
        }),
        hadDetailFetchError: true
      };
    }
  });

  const rawRecords: Array<Partial<FoodBank>> = [];
  let expandedLocations = 0;

  for (const { detail } of details) {
    rawRecords.push(mapBaseRecord(detail));

    const locations = detail.locations ?? [];
    for (const location of locations) {
      rawRecords.push(mapLocationRecord(detail, location));
      expandedLocations += 1;
    }
  }

  const normalized = rawRecords
    .map((record) => normalizer.normalizeRecord(record, "givefood"))
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  const deduped = dedupeByNameAndPostcode(normalized);
  const insertedRecords = await insertBatch(deduped);

  const result: GiveFoodIngestionResult = {
    source: "givefood",
    fetched_foodbanks: openFoodbanks.length,
    expanded_locations: expandedLocations,
    normalized_records: deduped.length,
    inserted_records: insertedRecords,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt
  };

  logger.info(result, "Finished GiveFood ingestion");
  return result;
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runGiveFoodIngestion()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      logger.error({ err: error }, "GiveFood ingestion failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
