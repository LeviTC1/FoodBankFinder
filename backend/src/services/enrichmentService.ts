import type { ReferralType } from "@foodbankfinder/shared";
import type { PoolClient } from "pg";
import { pool, withClient } from "../database/pool.js";
import { config } from "../config.js";
import { parseOpeningHours } from "../utils/parseOpeningHours.js";
import { fetchWebsiteContent } from "../utils/fetchWebsiteContent.js";
import { OpenAIService } from "./openaiService.js";
import { logger } from "../utils/logger.js";
import {
  inferReferralType,
  referralTypeToRequired
} from "../utils/referralType.js";

interface QueueFoodBankRow {
  foodbank_id: number;
  name: string;
  organisation: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  opening_hours: string | null;
  notes: string | null;
  services: string[] | null;
  inventory_tags: string[] | null;
  ai_summary: string | null;
  referral_required: boolean | null;
  referral_type: ReferralType;
}

interface QueueSeedResult {
  inserted: number;
  requeued: number;
}

export interface EnrichmentRunOptions {
  batchSize?: number;
  rateLimitMs?: number;
  minConfidence?: number;
  maxAttempts?: number;
}

export interface EnrichmentRunResult {
  queued: number;
  claimed: number;
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  ai_enabled: boolean;
  started_at: string;
  finished_at: string;
}

const DEFAULT_MAX_ATTEMPTS = 4;

const pause = async (ms: number) => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const toJson = (value: unknown): string | null => {
  if (value == null) return null;
  return JSON.stringify(value);
};

const normalizeText = (value?: string | null): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned : null;
};

const sanitizePhone = (value?: string | null): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const cleaned = normalized.replace(/[^\d+()\-\s]/g, "").trim();
  return cleaned.length >= 8 ? cleaned : null;
};

const sanitizeEmail = (value?: string | null): string | null => {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};

const dedupeList = (
  items?: Array<string | null | undefined> | null
): string[] | null => {
  if (!items) return null;
  const deduped = Array.from(
    new Set(
      items
        .map((item) => normalizeText(item))
        .filter((item): item is string => Boolean(item))
    )
  );
  return deduped.length ? deduped : null;
};

const regexPhone = (input: string): string | null => {
  const match = input.match(
    /(?:\+44\s?\d{2,4}|\(?0\d{2,4}\)?)\s?\d{2,4}\s?\d{2,4}\s?\d{2,4}/
  );
  return sanitizePhone(match?.[0] ?? null);
};

const regexEmail = (input: string): string | null => {
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return sanitizeEmail(match?.[0] ?? null);
};

const detectServicesFromText = (text: string): string[] | null => {
  const normalized = text.toLowerCase();
  const matches: string[] = [];

  if (
    /\b(food parcel|foodbank|food bank|emergency food|parcel collection)\b/.test(normalized)
  ) {
    matches.push("food parcels");
  }
  if (/\b(baby|napp(y|ies)|formula|baby food)\b/.test(normalized)) {
    matches.push("baby supplies");
  }
  if (/\b(hygiene|toiletr(y|ies)|sanitary|soap|shampoo|toothpaste)\b/.test(normalized)) {
    matches.push("hygiene products");
  }
  if (/\b(hot meal|warm meal|community meal|soup kitchen|breakfast club)\b/.test(normalized)) {
    matches.push("hot meals");
  }
  if (/\b(advice|debt support|benefit support|welfare|signpost)\b/.test(normalized)) {
    matches.push("advice and support");
  }

  return dedupeList(matches);
};

const detectInventoryTags = (text: string): string[] | null => {
  const normalized = text.toLowerCase();
  const tags: string[] = [];

  if (/\b(baby|napp(y|ies)|formula|baby food)\b/.test(normalized)) {
    tags.push("baby supplies");
  }
  if (/\b(hygiene|toiletr(y|ies)|sanitary|soap|shampoo|toothpaste)\b/.test(normalized)) {
    tags.push("hygiene packs");
  }
  if (/\b(hot meal|warm meal|community meal|soup kitchen)\b/.test(normalized)) {
    tags.push("hot meals");
  }
  if (/\b(food parcel|food package|emergency food)\b/.test(normalized)) {
    tags.push("food parcels");
  }

  return dedupeList(tags);
};

const hasContent = (value?: string | null): boolean => Boolean(normalizeText(value));

const hasArrayContent = (value?: string[] | null): boolean => Boolean(value && value.length > 0);

const seedQueue = async (
  client: PoolClient,
  maxAttempts: number
): Promise<QueueSeedResult> => {
  const insertRes = await client.query(
    `
      INSERT INTO enrichment_queue (
        foodbank_id,
        status,
        attempts,
        created_at,
        updated_at
      )
      SELECT
        f.id,
        'pending',
        0,
        NOW(),
        NOW()
      FROM foodbanks f
      WHERE f.website IS NOT NULL
        AND NULLIF(TRIM(f.website), '') IS NOT NULL
        AND (f.ai_summary IS NULL OR NULLIF(TRIM(f.ai_summary), '') IS NULL)
      ON CONFLICT (foodbank_id) DO NOTHING
    `
  );

  const requeueFailedRes = await client.query(
    `
      UPDATE enrichment_queue q
      SET
        status = 'pending',
        updated_at = NOW(),
        error_message = NULL
      FROM foodbanks f
      WHERE q.foodbank_id = f.id
        AND q.status = 'failed'
        AND q.attempts < $1
        AND (q.last_attempt IS NULL OR q.last_attempt < NOW() - interval '12 hours')
        AND (f.ai_summary IS NULL OR NULLIF(TRIM(f.ai_summary), '') IS NULL)
    `,
    [maxAttempts]
  );

  const recoverStalledRes = await client.query(
    `
      UPDATE enrichment_queue
      SET
        status = 'pending',
        updated_at = NOW()
      WHERE status = 'processing'
        AND (last_attempt IS NULL OR last_attempt < NOW() - interval '2 hours')
    `
  );

  return {
    inserted: insertRes.rowCount ?? 0,
    requeued: (requeueFailedRes.rowCount ?? 0) + (recoverStalledRes.rowCount ?? 0)
  };
};

const claimQueueBatch = async (options: {
  batchSize: number;
  maxAttempts: number;
}): Promise<{ rows: QueueFoodBankRow[]; seed: QueueSeedResult }> =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const seed = await seedQueue(client, options.maxAttempts);

      const candidateRes = await client.query<QueueFoodBankRow>(
        `
          SELECT
            q.foodbank_id,
            f.name,
            f.organisation,
            f.website,
            f.phone,
            f.email,
            f.opening_hours,
            f.notes,
            CASE
              WHEN f.services IS NULL THEN NULL
              ELSE ARRAY(
                SELECT jsonb_array_elements_text(f.services)
              )
            END AS services,
            CASE
              WHEN f.inventory_tags IS NULL THEN NULL
              ELSE ARRAY(
                SELECT jsonb_array_elements_text(f.inventory_tags)
              )
            END AS inventory_tags,
            f.ai_summary,
            f.referral_required,
            f.referral_type
          FROM enrichment_queue q
          INNER JOIN foodbanks f ON f.id = q.foodbank_id
          WHERE q.status IN ('pending', 'failed')
            AND q.attempts < $1
            AND f.website IS NOT NULL
            AND NULLIF(TRIM(f.website), '') IS NOT NULL
            AND (f.ai_summary IS NULL OR NULLIF(TRIM(f.ai_summary), '') IS NULL)
          ORDER BY
            CASE WHEN q.status = 'pending' THEN 0 ELSE 1 END,
            q.last_attempt NULLS FIRST
          LIMIT $2
          FOR UPDATE OF q SKIP LOCKED
        `,
        [options.maxAttempts, options.batchSize]
      );

      const ids = candidateRes.rows.map((row) => row.foodbank_id);
      if (ids.length > 0) {
        await client.query(
          `
            UPDATE enrichment_queue
            SET
              status = 'processing',
              attempts = attempts + 1,
              last_attempt = NOW(),
              error_message = NULL,
              updated_at = NOW()
            WHERE foodbank_id = ANY($1::int[])
          `,
          [ids]
        );
      }

      await client.query("COMMIT");
      return {
        rows: candidateRes.rows,
        seed
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

const markQueueStatus = async (
  foodbankId: number,
  status: "completed" | "failed",
  errorMessage?: string | null
) => {
  await pool.query(
    `
      UPDATE enrichment_queue
      SET
        status = $2,
        error_message = $3,
        updated_at = NOW()
      WHERE foodbank_id = $1
    `,
    [foodbankId, status, errorMessage ?? null]
  );
};

const applyEnrichment = async (input: {
  foodbankId: number;
  phone?: string | null;
  email?: string | null;
  openingHours?: string | null;
  services?: string[] | null;
  inventoryTags?: string[] | null;
  aiSummary?: string | null;
  notes?: string | null;
  confidence?: number | null;
  referralType?: ReferralType | null;
}) => {
  const parsedHours = parseOpeningHours(input.openingHours);
  const referralType =
    input.referralType === "required" ||
    input.referralType === "soft" ||
    input.referralType === "none" ||
    input.referralType === "unknown"
      ? input.referralType
      : "unknown";
  const referralRequired = referralTypeToRequired(referralType);

  await pool.query(
    `
      UPDATE foodbanks
      SET
        phone = CASE
          WHEN COALESCE(NULLIF(phone, ''), '') = '' AND $2::text IS NOT NULL THEN $2::text
          ELSE phone
        END,
        email = CASE
          WHEN COALESCE(NULLIF(email, ''), '') = '' AND $3::text IS NOT NULL THEN $3::text
          ELSE email
        END,
        opening_hours = CASE
          WHEN COALESCE(NULLIF(opening_hours, ''), '') = '' AND $4::text IS NOT NULL THEN $4::text
          ELSE opening_hours
        END,
        opening_hours_parsed = CASE
          WHEN opening_hours_parsed IS NULL AND $5::jsonb IS NOT NULL THEN $5::jsonb
          ELSE opening_hours_parsed
        END,
        services = CASE
          WHEN (
            services IS NULL
            OR jsonb_typeof(services) <> 'array'
            OR jsonb_array_length(services) = 0
          ) AND $6::jsonb IS NOT NULL THEN $6::jsonb
          ELSE services
        END,
        inventory_tags = CASE
          WHEN (
            inventory_tags IS NULL
            OR jsonb_typeof(inventory_tags) <> 'array'
            OR jsonb_array_length(inventory_tags) = 0
          ) AND $7::jsonb IS NOT NULL THEN $7::jsonb
          ELSE inventory_tags
        END,
        ai_summary = CASE
          WHEN COALESCE(NULLIF(ai_summary, ''), '') = '' AND $8::text IS NOT NULL THEN $8::text
          ELSE ai_summary
        END,
        notes = CASE
          WHEN COALESCE(NULLIF(notes, ''), '') = '' AND $9::text IS NOT NULL THEN $9::text
          ELSE notes
        END,
        ai_confidence = COALESCE($10::double precision, ai_confidence),
        referral_type = CASE
          WHEN COALESCE(referral_type, 'unknown') = 'unknown' AND $11::text <> 'unknown' THEN $11::text
          ELSE referral_type
        END,
        referral_required = CASE
          WHEN referral_required IS NULL AND $12::boolean IS NOT NULL THEN $12::boolean
          ELSE referral_required
        END,
        ai_last_updated = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      input.foodbankId,
      sanitizePhone(input.phone),
      sanitizeEmail(input.email),
      normalizeText(input.openingHours),
      toJson(parsedHours),
      toJson(dedupeList(input.services)),
      toJson(dedupeList(input.inventoryTags)),
      normalizeText(input.aiSummary),
      normalizeText(input.notes),
      input.confidence ?? null,
      referralType,
      referralRequired
    ]
  );
};

const shouldUseAiFields = (confidence: number, minConfidence: number): boolean =>
  Number.isFinite(confidence) && confidence >= minConfidence;

const enrichSingleFoodBank = async (
  row: QueueFoodBankRow,
  deps: {
    openAi: OpenAIService;
    minConfidence: number;
  }
) => {
  if (!row.website) {
    throw new Error("Missing website URL");
  }

  const websitePayload = await fetchWebsiteContent(row.website);
  if (!websitePayload) {
    throw new Error("Unable to fetch readable website content");
  }

  const regexDetectedPhone = regexPhone(websitePayload.content);
  const regexDetectedEmail = regexEmail(websitePayload.content);
  const regexDetectedServices = detectServicesFromText(websitePayload.content);
  const regexDetectedInventory = detectInventoryTags(websitePayload.content);

  let aiPhone: string | null = null;
  let aiEmail: string | null = null;
  let aiOpeningHours: string | null = null;
  let aiServices: string[] | null = null;
  let aiSummary: string | null = null;
  let aiConfidence = 0;
  let aiExtractionFailed = false;

  if (deps.openAi.isConfigured()) {
    try {
      const aiResult = await deps.openAi.extractFoodBankInfo({
        name: row.name,
        organisation: row.organisation,
        website: websitePayload.url,
        websiteText: websitePayload.content,
        known: {
          phone: row.phone,
          email: row.email,
          opening_hours: row.opening_hours,
          notes: row.notes
        }
      });

      aiPhone = sanitizePhone(aiResult.phone);
      aiEmail = sanitizeEmail(aiResult.email);
      aiOpeningHours = normalizeText(aiResult.opening_hours);
      aiServices = dedupeList(aiResult.services ?? null);
      aiSummary = normalizeText(aiResult.summary);
      aiConfidence = aiResult.confidence ?? 0;
    } catch (error) {
      aiExtractionFailed = true;
      logger.warn(
        { foodbank_id: row.foodbank_id, err: error },
        "OpenAI enrichment failed, continuing with regex fallback"
      );
    }
  }

  const useAi = shouldUseAiFields(aiConfidence, deps.minConfidence);

  const mergedServices = dedupeList([
    ...(useAi ? aiServices ?? [] : []),
    ...(regexDetectedServices ?? [])
  ]);

  const mergedInventoryTags = dedupeList([
    ...(regexDetectedInventory ?? []),
    ...(mergedServices ?? []).filter((service) =>
      ["baby supplies", "hygiene products", "hot meals", "food parcels"].includes(
        service.toLowerCase()
      )
    )
  ]);

  const notesCandidate =
    !hasContent(row.notes) && useAi && aiSummary ? `AI extracted summary: ${aiSummary}` : null;

  const inferredReferralType = inferReferralType({
    explicitType: row.referral_type,
    referralRequired: row.referral_required,
    texts: [
      row.notes,
      row.opening_hours,
      row.ai_summary,
      websitePayload.content,
      useAi ? aiSummary : null,
      useAi ? aiOpeningHours : null
    ]
  });

  await applyEnrichment({
    foodbankId: row.foodbank_id,
    phone: hasContent(row.phone) ? null : aiPhone ?? regexDetectedPhone,
    email: hasContent(row.email) ? null : aiEmail ?? regexDetectedEmail,
    openingHours: hasContent(row.opening_hours) ? null : useAi ? aiOpeningHours : null,
    services: hasArrayContent(row.services) ? null : mergedServices,
    inventoryTags: hasArrayContent(row.inventory_tags) ? null : mergedInventoryTags,
    aiSummary: hasContent(row.ai_summary) ? null : useAi ? aiSummary : null,
    notes: notesCandidate,
    confidence: aiExtractionFailed ? null : aiConfidence,
    referralType: inferredReferralType
  });
};

export const processFoodBankEnrichment = async (
  options: EnrichmentRunOptions = {}
): Promise<EnrichmentRunResult> => {
  const startedAt = new Date();

  const batchSize = Math.min(200, Math.max(1, options.batchSize ?? config.enrichmentBatchSize));
  const rateLimitMs = Math.max(0, options.rateLimitMs ?? config.enrichmentRateLimitMs);
  const minConfidence = Math.max(
    0,
    Math.min(1, options.minConfidence ?? config.enrichmentMinConfidence)
  );
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  const openAi = new OpenAIService();

  const { rows, seed } = await claimQueueBatch({
    batchSize,
    maxAttempts
  });

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    try {
      await enrichSingleFoodBank(row, {
        openAi,
        minConfidence
      });
      await markQueueStatus(row.foodbank_id, "completed");
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown enrichment failure";
      logger.warn(
        { foodbank_id: row.foodbank_id, err: error },
        "Food bank enrichment failed"
      );
      await markQueueStatus(row.foodbank_id, "failed", message);
      failed += 1;
    } finally {
      processed += 1;
      if (index < rows.length - 1) {
        await pause(rateLimitMs);
      }
    }
  }

  if (rows.length === 0) {
    skipped = 1;
  }

  return {
    queued: seed.inserted + seed.requeued,
    claimed: rows.length,
    processed,
    completed,
    failed,
    skipped,
    ai_enabled: openAi.isConfigured(),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString()
  };
};

export const getEnrichmentQueueSummary = async (): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> => {
  const res = await pool.query<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM enrichment_queue
    `
  );

  return (
    res.rows[0] ?? {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    }
  );
};
