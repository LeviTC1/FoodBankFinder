import type { FoodBank, SourceName } from "@foodbankfinder/shared";

export interface IngestionProvider {
  source: SourceName;
  fetchRawRecords(): Promise<Array<Partial<FoodBank>>>;
}
