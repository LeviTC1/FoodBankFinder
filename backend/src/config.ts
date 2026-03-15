import dotenv from "dotenv";

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseCorsOrigin = (value: string | undefined): string | string[] => {
  const normalized = value?.trim();
  if (!normalized) {
    return "http://localhost:5173";
  }

  if (normalized === "*") {
    return "*";
  }

  const origins = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : "http://localhost:5173";
};

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: toNumber(process.env.PORT, 4000),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/foodbankfinder",
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  mapboxToken: process.env.MAPBOX_TOKEN ?? "",
  giveFoodApiUrl:
    process.env.GIVEFOOD_API_URL ?? "https://www.givefood.org.uk/api/2/foodbanks/",
  trussellTrustDataUrl: process.env.TRUSSELL_TRUST_DATA_URL ?? "",
  ifanDataUrl: process.env.IFAN_DATA_URL ?? "",
  overpassUrl:
    process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  enrichmentBatchSize: toNumber(process.env.ENRICHMENT_BATCH_SIZE, 50),
  enrichmentRateLimitMs: toNumber(process.env.ENRICHMENT_RATE_LIMIT_MS, 1000),
  enrichmentMinConfidence: toNumber(process.env.ENRICHMENT_MIN_CONFIDENCE, 0.6)
};
