import type {
  CoverageCell,
  FoodBank,
  FoodBankQuery,
  FoodBankSearchQuery,
  FoodBankStats,
  ReferralType,
  WeekdayKey
} from "@foodbankfinder/shared";
import { pool, withClient } from "./pool";
import type { NormalizedFoodBank } from "../services/normalizationService";
import { isOpenNow } from "../utils/isOpenNow";

interface QueryResultMeta {
  total: number;
  page: number;
  limit: number;
  center?: {
    latitude: number;
    longitude: number;
  } | null;
}

export interface PaginatedFoodBanks {
  data: FoodBank[];
  meta: QueryResultMeta;
}

export interface NearbyQueryOptions {
  open_now?: boolean;
  referral_required?: boolean;
  referral_type?: ReferralType;
  organisation?: string;
  limit?: number;
}

const weekdayKeys: WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const COVERAGE_GAP_THRESHOLD_KM = 15;

const getCurrentDayKey = (): WeekdayKey => weekdayKeys[new Date().getDay()] ?? "monday";

const getCurrentTimeToken = (): string => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

const serializeJson = (value: unknown): string | null => {
  if (value == null) return null;
  return JSON.stringify(value);
};

const normalizeReferralType = (value: unknown): ReferralType => {
  if (typeof value !== "string") return "unknown";
  if (value === "required" || value === "soft" || value === "none" || value === "unknown") {
    return value;
  }
  return "unknown";
};

const addReferralFilter = (options: {
  referralType?: ReferralType;
  referralRequired?: boolean;
  conditions: string[];
  values: Array<string | number | boolean>;
}) => {
  if (options.referralType) {
    options.values.push(options.referralType);
    options.conditions.push(`referral_type = $${options.values.length}`);
    return;
  }

  if (typeof options.referralRequired !== "boolean") return;

  if (options.referralRequired) {
    options.conditions.push(`referral_type IN ('required', 'soft')`);
    return;
  }

  options.conditions.push(`referral_type IN ('none', 'soft')`);
};

const buildOpenNowCondition = (dayParam: number, timeParam: number): string => `
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(opening_hours_parsed -> $${dayParam}, '[]'::jsonb)) AS slot
    WHERE
      (slot->>'start') IS NOT NULL
      AND (slot->>'end') IS NOT NULL
      AND (
        (
          (slot->>'start') <= (slot->>'end')
          AND $${timeParam} >= (slot->>'start')
          AND $${timeParam} < (slot->>'end')
        )
        OR
        (
          (slot->>'start') > (slot->>'end')
          AND ($${timeParam} >= (slot->>'start') OR $${timeParam} < (slot->>'end'))
        )
      )
  )
`;

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringArrayOrNull = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return normalized.length ? normalized : null;
};

const rowToFoodBank = (row: Record<string, unknown>): FoodBank => {
  const openingHoursParsed = (row.opening_hours_parsed as FoodBank["opening_hours_parsed"]) ?? null;
  const services = toStringArrayOrNull(row.services);
  const inventoryTags = toStringArrayOrNull(row.inventory_tags);

  const foodBank: FoodBank = {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    organisation: (row.organisation as string) ?? null,
    address: (row.address as string) ?? null,
    postcode: (row.postcode as string) ?? null,
    latitude: toNumberOrNull(row.latitude),
    longitude: toNumberOrNull(row.longitude),
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    website: (row.website as string) ?? null,
    opening_hours: (row.opening_hours as string) ?? null,
    opening_hours_parsed: openingHoursParsed,
    services,
    inventory_tags: inventoryTags,
    ai_summary: (row.ai_summary as string) ?? null,
    ai_confidence: toNumberOrNull(row.ai_confidence),
    ai_last_updated: row.ai_last_updated
      ? new Date(row.ai_last_updated as string).toISOString()
      : null,
    referral_required: (row.referral_required as boolean) ?? null,
    referral_type: normalizeReferralType(row.referral_type),
    notes: (row.notes as string) ?? null,
    source: ((row.source as string) ?? "manual") as FoodBank["source"],
    last_updated: row.updated_at ? new Date(row.updated_at as string).toISOString() : null
  };

  foodBank.distance_km = toNumberOrNull(row.distance_km);
  foodBank.open_now = isOpenNow(foodBank);

  return foodBank;
};

export class FoodBankRepository {
  async list(query: FoodBankQuery): Promise<PaginatedFoodBanks> {
    const conditions: string[] = [];
    const whereValues: Array<string | number | boolean> = [];
    const distanceValues: number[] = [];

    let distanceExpr = "NULL::double precision AS distance_km";
    const hasLocation = query.lat != null && query.lng != null;

    if (query.postcode) {
      whereValues.push(`%${query.postcode}%`);
      conditions.push(`postcode ILIKE $${whereValues.length}`);
    }

    addReferralFilter({
      referralType: query.referral_type,
      referralRequired: query.referral_required,
      conditions,
      values: whereValues
    });

    if (query.organisation) {
      whereValues.push(`%${query.organisation}%`);
      conditions.push(`organisation ILIKE $${whereValues.length}`);
    }

    if (typeof query.open_now === "boolean") {
      whereValues.push(getCurrentDayKey(), getCurrentTimeToken());
      const dayParam = whereValues.length - 1;
      const timeParam = whereValues.length;
      const openCondition = buildOpenNowCondition(dayParam, timeParam);
      conditions.push(query.open_now ? openCondition : `NOT (${openCondition})`);
    }

    if (hasLocation && query.radius != null) {
      whereValues.push(query.lng as number, query.lat as number, query.radius * 1000);
      const lngParam = whereValues.length - 2;
      const latParam = whereValues.length - 1;
      const radiusParam = whereValues.length;
      conditions.push(
        `ST_DWithin(
          geom,
          ST_SetSRID(ST_MakePoint($${lngParam}, $${latParam}), 4326)::geography,
          $${radiusParam}
        )`
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(5000, Math.max(1, query.limit ?? 500));
    const offset = (page - 1) * limit;

    if (hasLocation) {
      const distanceLngParam = whereValues.length + 1;
      const distanceLatParam = whereValues.length + 2;
      distanceValues.push(query.lng as number, query.lat as number);
      distanceExpr = `ST_Distance(
        geom,
        ST_SetSRID(ST_MakePoint($${distanceLngParam}, $${distanceLatParam}), 4326)::geography
      ) / 1000 AS distance_km`;
    }

    const values = [...whereValues, ...distanceValues, limit, offset];
    const limitParam = values.length - 1;
    const offsetParam = values.length;
    const orderBy = hasLocation ? "distance_km ASC" : "updated_at DESC";

    const sql = `
      SELECT
        id,
        name,
        organisation,
        address,
        postcode,
        latitude,
        longitude,
        phone,
        email,
        website,
        opening_hours,
        opening_hours_parsed,
        services,
        inventory_tags,
        ai_summary,
        ai_confidence,
        ai_last_updated,
        referral_required,
        referral_type,
        notes,
        source,
        updated_at,
        ${distanceExpr}
      FROM foodbanks
      ${where}
      ORDER BY ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const countSql = `SELECT COUNT(*)::int AS total FROM foodbanks ${where}`;

    const [dataRes, countRes] = await Promise.all([
      pool.query(sql, values),
      pool.query(countSql, whereValues)
    ]);

    return {
      data: dataRes.rows.map((row) => rowToFoodBank(row as Record<string, unknown>)),
      meta: {
        total: countRes.rows[0]?.total ?? 0,
        page,
        limit
      }
    };
  }

  async nearby(
    lat: number,
    lng: number,
    radiusKm: number,
    options: NearbyQueryOptions = {}
  ): Promise<FoodBank[]> {
    const conditions: string[] = [
      `ST_DWithin(
        geom,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )`
    ];

    const values: Array<string | number | boolean> = [lng, lat, radiusKm * 1000];

    if (typeof options.open_now === "boolean") {
      values.push(getCurrentDayKey(), getCurrentTimeToken());
      const dayParam = values.length - 1;
      const timeParam = values.length;
      const openCondition = buildOpenNowCondition(dayParam, timeParam);
      conditions.push(options.open_now ? openCondition : `NOT (${openCondition})`);
    }

    addReferralFilter({
      referralType: options.referral_type,
      referralRequired: options.referral_required,
      conditions,
      values
    });

    if (options.organisation) {
      values.push(`%${options.organisation}%`);
      conditions.push(`organisation ILIKE $${values.length}`);
    }

    const limit = Math.min(5000, Math.max(1, options.limit ?? 1000));
    values.push(limit);

    const sql = `
      SELECT
        id,
        name,
        organisation,
        address,
        postcode,
        latitude,
        longitude,
        phone,
        email,
        website,
        opening_hours,
        opening_hours_parsed,
        services,
        inventory_tags,
        ai_summary,
        ai_confidence,
        ai_last_updated,
        referral_required,
        referral_type,
        notes,
        source,
        updated_at,
        ST_Distance(
          geom,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) / 1000 AS distance_km
      FROM foodbanks
      WHERE ${conditions.join(" AND ")}
      ORDER BY distance_km ASC
      LIMIT $${values.length}
    `;

    const res = await pool.query(sql, values);
    return res.rows.map((row) => rowToFoodBank(row as Record<string, unknown>));
  }

  async byId(id: string): Promise<FoodBank | null> {
    const sql = `
      SELECT
        id,
        name,
        organisation,
        address,
        postcode,
        latitude,
        longitude,
        phone,
        email,
        website,
        opening_hours,
        opening_hours_parsed,
        services,
        inventory_tags,
        ai_summary,
        ai_confidence,
        ai_last_updated,
        referral_required,
        referral_type,
        notes,
        source,
        updated_at
      FROM foodbanks
      WHERE id = $1
      LIMIT 1
    `;

    const res = await pool.query(sql, [id]);
    if (!res.rows[0]) return null;
    return rowToFoodBank(res.rows[0] as Record<string, unknown>);
  }

  async search(query: FoodBankSearchQuery): Promise<PaginatedFoodBanks> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (query.postcode) {
      values.push(`%${query.postcode}%`);
      conditions.push(`postcode ILIKE $${values.length}`);
    }

    const cityTerm = query.city ?? query.town;
    if (cityTerm) {
      values.push(`%${cityTerm}%`);
      conditions.push(`address ILIKE $${values.length}`);
    }

    if (query.organisation) {
      values.push(`%${query.organisation}%`);
      conditions.push(`organisation ILIKE $${values.length}`);
    }

    if (query.service) {
      values.push(`%${query.service}%`);
      conditions.push(
        `(COALESCE(services::text, '') ILIKE $${values.length} OR COALESCE(inventory_tags::text, '') ILIKE $${values.length})`
      );
    }

    if (query.q) {
      const normalizedQ = query.q.toLowerCase();
      if (/\bno referral\b|\bwithout referral\b|\bself referral\b/.test(normalizedQ)) {
        conditions.push(`referral_type IN ('none', 'soft')`);
      } else if (/\breferral required\b|\bvoucher\b|\breferred\b/.test(normalizedQ)) {
        conditions.push(`referral_type IN ('required', 'soft')`);
      } else {
        values.push(`%${query.q}%`);
        conditions.push(
          `(
            name ILIKE $${values.length}
            OR organisation ILIKE $${values.length}
            OR address ILIKE $${values.length}
            OR postcode ILIKE $${values.length}
            OR notes ILIKE $${values.length}
            OR ai_summary ILIKE $${values.length}
            OR COALESCE(services::text, '') ILIKE $${values.length}
            OR COALESCE(inventory_tags::text, '') ILIKE $${values.length}
          )`
        );
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(5000, Math.max(1, query.limit ?? 500));
    const offset = (page - 1) * limit;

    const countValues = [...values];

    let orderBy = "updated_at DESC";
    if (query.postcode) {
      values.push(query.postcode.replace(/\s+/g, "").toUpperCase());
      orderBy = `
        CASE
          WHEN REPLACE(UPPER(COALESCE(postcode, '')), ' ', '') = $${values.length}
            THEN 0
          ELSE 1
        END,
        updated_at DESC
      `;
    }

    values.push(limit, offset);

    const sql = `
      SELECT
        id,
        name,
        organisation,
        address,
        postcode,
        latitude,
        longitude,
        phone,
        email,
        website,
        opening_hours,
        opening_hours_parsed,
        services,
        inventory_tags,
        ai_summary,
        ai_confidence,
        ai_last_updated,
        referral_required,
        referral_type,
        notes,
        source,
        updated_at
      FROM foodbanks
      ${where}
      ORDER BY ${orderBy}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const countSql = `SELECT COUNT(*)::int AS total FROM foodbanks ${where}`;

    const [dataRes, countRes] = await Promise.all([
      pool.query(sql, values),
      pool.query(countSql, countValues)
    ]);

    let center: QueryResultMeta["center"] = null;

    if (query.postcode) {
      const candidate = dataRes.rows.find(
        (row) =>
          typeof row.latitude === "number" &&
          Number.isFinite(row.latitude) &&
          typeof row.longitude === "number" &&
          Number.isFinite(row.longitude)
      );

      if (candidate) {
        center = {
          latitude: candidate.latitude as number,
          longitude: candidate.longitude as number
        };
      } else {
        const centerRes = await pool.query<{
          latitude: number;
          longitude: number;
        }>(
          `
            SELECT latitude, longitude
            FROM foodbanks
            WHERE postcode ILIKE $1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            LIMIT 1
          `,
          [`%${query.postcode}%`]
        );

        const row = centerRes.rows[0];
        if (row) {
          center = {
            latitude: row.latitude,
            longitude: row.longitude
          };
        }
      }
    }

    return {
      data: dataRes.rows.map((row) => rowToFoodBank(row as Record<string, unknown>)),
      meta: {
        total: countRes.rows[0]?.total ?? 0,
        page,
        limit,
        center
      }
    };
  }

  async coverageCells(limit = 8000): Promise<CoverageCell[]> {
    const boundedLimit = Math.min(20000, Math.max(1, limit));
    const res = await pool.query(
      `
        SELECT lat, lng, distance_to_foodbank, coverage_score
        FROM coverage_cells
        ORDER BY coverage_score ASC, distance_to_foodbank DESC
        LIMIT $1
      `,
      [boundedLimit]
    );

    return res.rows.map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lng),
      distance_to_foodbank: Number(row.distance_to_foodbank),
      coverage_score: Number(row.coverage_score)
    }));
  }

  async stats(): Promise<FoodBankStats> {
    const totalRes = await pool.query("SELECT COUNT(*)::int AS total FROM foodbanks");

    const distributionRes = await pool.query(`
      SELECT
        COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(UPPER(postcode), '[^A-Z0-9]', '', 'g') FROM '^[A-Z]{1,2}'), ''), 'UNKNOWN') AS region,
        COUNT(*)::int AS count
      FROM foodbanks
      GROUP BY region
      ORDER BY count DESC
      LIMIT 30
    `);

    const coverageIndexRes = await pool.query<{
      cells: number;
      avg_km: number;
      gaps: number;
    }>(
      `
        SELECT
          COUNT(*)::int AS cells,
          COALESCE(AVG(distance_to_foodbank), 0)::float AS avg_km,
          COUNT(*) FILTER (WHERE distance_to_foodbank > $1)::int AS gaps
        FROM coverage_cells
      `,
      [COVERAGE_GAP_THRESHOLD_KM]
    );

    let averageDistance = Number(coverageIndexRes.rows[0]?.avg_km ?? 0);
    let coverageGaps = Number(coverageIndexRes.rows[0]?.gaps ?? 0);

    if ((coverageIndexRes.rows[0]?.cells ?? 0) === 0) {
      const fallbackCoverageRes = await pool.query(`
        WITH nearest AS (
          SELECT
            a.id,
            (
              SELECT ST_Distance(a.geom, b.geom) / 1000
              FROM foodbanks b
              WHERE b.id <> a.id
                AND b.geom IS NOT NULL
              ORDER BY a.geom <-> b.geom
              LIMIT 1
            ) AS nearest_km
          FROM foodbanks a
          WHERE a.geom IS NOT NULL
        )
        SELECT COALESCE(AVG(nearest_km), 0)::float AS avg_km
        FROM nearest
        WHERE nearest_km IS NOT NULL
      `);

      averageDistance = Number(fallbackCoverageRes.rows[0]?.avg_km ?? 0);
      coverageGaps = 0;
    }

    return {
      total_foodbanks: totalRes.rows[0]?.total ?? 0,
      distribution_by_region: distributionRes.rows.map((row) => ({
        region: row.region as string,
        count: row.count as number
      })),
      average_coverage_distance_km: averageDistance,
      average_distance_km: averageDistance,
      coverage_gaps_detected: coverageGaps
    };
  }

  async upsertBatch(records: NormalizedFoodBank[]): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
  }> {
    if (!records.length) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    return withClient(async (client) => {
      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      await client.query("BEGIN");
      try {
        for (const record of records) {
          if (!record.name) {
            skipped += 1;
            continue;
          }

          const lookup = await client.query<{ id: number }>(
            `
              SELECT id
              FROM foodbanks
              WHERE LOWER(COALESCE(name, '')) = LOWER(COALESCE($1, ''))
                AND UPPER(COALESCE(postcode, '')) = UPPER(COALESCE($2, ''))
              LIMIT 1
            `,
            [record.name, record.postcode]
          );

          if (lookup.rows[0]?.id) {
            await client.query(
              `
                UPDATE foodbanks
                SET
                  organisation = COALESCE($2, organisation),
                  address = COALESCE($3, address),
                  latitude = COALESCE($4, latitude),
                  longitude = COALESCE($5, longitude),
                  geom = COALESCE(
                    CASE WHEN $4::double precision IS NOT NULL AND $5::double precision IS NOT NULL
                      THEN ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography
                      ELSE NULL
                    END,
                    geom
                  ),
                  phone = COALESCE($6, phone),
                  email = COALESCE($7, email),
                  website = COALESCE($8, website),
                  opening_hours = COALESCE($9, opening_hours),
                  opening_hours_parsed = COALESCE($10::jsonb, opening_hours_parsed),
                  referral_required = COALESCE($11, referral_required),
                  referral_type = CASE
                    WHEN COALESCE($12, 'unknown') <> 'unknown' THEN $12
                    ELSE referral_type
                  END,
                  notes = COALESCE($13, notes),
                  source = COALESCE($14, source),
                  updated_at = NOW()
                WHERE id = $1
              `,
              [
                lookup.rows[0].id,
                record.organisation,
                record.address,
                record.latitude,
                record.longitude,
                record.phone,
                record.email,
                record.website,
                record.opening_hours,
                serializeJson(record.opening_hours_parsed),
                record.referral_required,
                record.referral_type ?? "unknown",
                record.notes,
                record.source
              ]
            );
            updated += 1;
            continue;
          }

          await client.query(
            `
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
                referral_type,
                notes,
                source,
                created_at,
                updated_at
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                CASE WHEN $5::double precision IS NOT NULL AND $6::double precision IS NOT NULL
                  THEN ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography
                  ELSE NULL
                END,
                $7,
                $8,
                $9,
                $10,
                $11::jsonb,
                $12,
                $13,
                $14,
                $15,
                NOW(),
                NOW()
              )
            `,
            [
              record.name,
              record.organisation,
              record.address,
              record.postcode,
              record.latitude,
              record.longitude,
              record.phone,
              record.email,
              record.website,
              record.opening_hours,
              serializeJson(record.opening_hours_parsed),
              record.referral_required,
              record.referral_type ?? "unknown",
              record.notes,
              record.source
            ]
          );

          inserted += 1;
        }

        await client.query("COMMIT");
        return { inserted, updated, skipped };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async distinctOrganisations(): Promise<string[]> {
    const res = await pool.query(`
      SELECT DISTINCT organisation
      FROM foodbanks
      WHERE organisation IS NOT NULL
      ORDER BY organisation ASC
      LIMIT 500
    `);

    return res.rows
      .map((row) => row.organisation as string)
      .filter((org) => typeof org === "string" && org.trim().length > 0);
  }
}
