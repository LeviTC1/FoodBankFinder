import axios from "axios";
import type { FoodBank } from "@foodbankfinder/shared";
import type { IngestionProvider } from "./baseProvider.js";

export interface LocalCouncilSourceConfig {
  name: string;
  url: string;
  parser: (payload: unknown) => Array<Partial<FoodBank>>;
}

export class LocalCouncilProvider implements IngestionProvider {
  source = "local_council" as const;

  constructor(private readonly sources: LocalCouncilSourceConfig[]) {}

  async fetchRawRecords(): Promise<Array<Partial<FoodBank>>> {
    const output: Array<Partial<FoodBank>> = [];

    for (const source of this.sources) {
      try {
        const response = await axios.get(source.url, { timeout: 45_000 });
        const records = source.parser(response.data).map((record) => ({
          ...record,
          source: "local_council" as const,
          organisation: record.organisation ?? source.name
        }));

        output.push(...records);
      } catch {
        // Ignore failing council sources to keep ingestion resilient.
      }
    }

    return output;
  }
}
