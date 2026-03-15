import { pool } from "../backend/src/database/pool";
import {
  getEnrichmentQueueSummary,
  processFoodBankEnrichment
} from "../backend/src/services/enrichmentService";

const toNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const main = async () => {
  const result = await processFoodBankEnrichment({
    batchSize: toNumber(process.env.ENRICHMENT_BATCH_SIZE),
    rateLimitMs: toNumber(process.env.ENRICHMENT_RATE_LIMIT_MS),
    minConfidence: toNumber(process.env.ENRICHMENT_MIN_CONFIDENCE)
  });

  const queue = await getEnrichmentQueueSummary();

  console.log(
    JSON.stringify(
      {
        run: result,
        queue
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
