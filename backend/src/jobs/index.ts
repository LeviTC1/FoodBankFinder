import cron from "node-cron";
import {
  runDailyUpdateFoodbanks,
  runWeeklyRebuildDataset,
  runSourceHealthCheck,
  runDailyEnrichment
} from "./runner";
import { logger } from "../utils/logger";

runDailyUpdateFoodbanks().catch((err) => logger.error({ err }, "Daily update failed"));

cron.schedule("0 3 * * *", () => {
  runDailyUpdateFoodbanks().catch((err) => logger.error({ err }, "Daily update failed"));
});

cron.schedule("30 2 * * 1", () => {
  runWeeklyRebuildDataset().catch((err) => logger.error({ err }, "Weekly rebuild failed"));
});

cron.schedule("0 */6 * * *", () => {
  runSourceHealthCheck().catch((err) => logger.error({ err }, "Health check failed"));
});

cron.schedule("30 4 * * *", () => {
  runDailyEnrichment().catch((err) => logger.error({ err }, "Daily enrichment failed"));
});

logger.info("Background jobs scheduler started");
