import type { IngestionResult, SourceName } from "@foodbankfinder/shared";
import type { IngestionProvider } from "./providers/baseProvider";
import { FoodBankRepository } from "../database/foodBankRepository";
import { NormalizationService } from "../services/normalizationService";
import { logger } from "../utils/logger";

export class IngestionService {
  private readonly normalizer = new NormalizationService();
  private readonly repository = new FoodBankRepository();

  async run(provider: IngestionProvider): Promise<IngestionResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    try {
      const raw = await provider.fetchRawRecords();
      const normalized = this.normalizer.normalizeBatch(raw, provider.source as SourceName);

      const writeResult = await this.repository.upsertBatch(normalized);

      return {
        source: provider.source,
        fetched: raw.length,
        normalized: normalized.length,
        inserted: writeResult.inserted,
        updated: writeResult.updated,
        skipped: writeResult.skipped + (raw.length - normalized.length),
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        errors
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      errors.push(message);
      logger.error({ err: error, source: provider.source }, "Ingestion failed");

      return {
        source: provider.source,
        fetched: 0,
        normalized: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        errors
      };
    }
  }
}
