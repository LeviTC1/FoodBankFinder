import axios from "axios";
import { config } from "../config.js";
import { IngestionService } from "../ingestion/ingestionService.js";
import { runGiveFoodIngestion } from "../ingestion/givefood_ingest.js";
import { TrussellTrustProvider } from "../ingestion/providers/trussellTrustProvider.js";
import { IFANProvider } from "../ingestion/providers/ifanProvider.js";
import { OpenStreetMapProvider } from "../ingestion/providers/openStreetMapProvider.js";
import { processFoodBankEnrichment } from "../services/enrichmentService.js";
import { logger } from "../utils/logger.js";

const ingestion = new IngestionService();

export const runDailyUpdateFoodbanks = async () => {
  logger.info("Starting daily_update_foodbanks job");
  const results = [await runGiveFoodIngestion()];
  logger.info({ results }, "Completed daily_update_foodbanks job");
  return results;
};

export const runWeeklyRebuildDataset = async () => {
  logger.info("Starting weekly_rebuild_dataset job");
  const results = await Promise.all([
    runGiveFoodIngestion(),
    ingestion.run(new TrussellTrustProvider()),
    ingestion.run(new IFANProvider()),
    ingestion.run(new OpenStreetMapProvider())
  ]);
  logger.info({ results }, "Completed weekly_rebuild_dataset job");
  return results;
};

export const runSourceHealthCheck = async () => {
  logger.info("Starting source_health_check job");

  const checks = [
    {
      source: "givefood",
      url: config.giveFoodApiUrl
    },
    {
      source: "trussell_trust",
      url: config.trussellTrustDataUrl || "https://www.trusselltrust.org"
    },
    {
      source: "ifan",
      url: config.ifanDataUrl || "https://www.foodaidnetwork.org.uk"
    },
    {
      source: "openstreetmap",
      url: config.overpassUrl
    }
  ];

  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        const res = await axios.head(check.url, { timeout: 15_000 });
        return {
          source: check.source,
          url: check.url,
          status: "ok",
          statusCode: res.status
        };
      } catch (error) {
        return {
          source: check.source,
          url: check.url,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown health check error"
        };
      }
    })
  );

  logger.info({ results }, "Completed source_health_check job");
  return results;
};

export const runDailyEnrichment = async () => {
  logger.info("Starting daily_enrichment job");
  const result = await processFoodBankEnrichment({
    batchSize: config.enrichmentBatchSize,
    rateLimitMs: config.enrichmentRateLimitMs,
    minConfidence: config.enrichmentMinConfidence
  });
  logger.info({ result }, "Completed daily_enrichment job");
  return result;
};
