import axios from "axios";
import * as cheerio from "cheerio";
import type { FoodBank } from "@foodbankfinder/shared";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import type { IngestionProvider } from "./baseProvider.js";

const mapJsonToFoodBank = (record: Record<string, unknown>): Partial<FoodBank> => ({
  name: (record.name as string) || (record.organisation as string) || "IFAN Member",
  organisation:
    (record.organisation as string) ||
    (record.network as string) ||
    "Independent Food Aid Network",
  address: (record.address as string) || (record.location as string) || null,
  postcode: (record.postcode as string) || null,
  phone: (record.phone as string) || (record.telephone as string) || null,
  email: (record.email as string) || null,
  opening_hours: (record.opening_hours as string) || null,
  website: (record.website as string) || (record.url as string) || null,
  notes: (record.notes as string) || null,
  source: "ifan"
});

export class IFANProvider implements IngestionProvider {
  source = "ifan" as const;

  async fetchRawRecords(): Promise<Array<Partial<FoodBank>>> {
    if (config.ifanDataUrl) {
      logger.info({ url: config.ifanDataUrl }, "Fetching IFAN dataset");

      const res = await axios.get(config.ifanDataUrl, { timeout: 45_000 });
      if (Array.isArray(res.data)) {
        return (res.data as Array<Record<string, unknown>>).map(mapJsonToFoodBank);
      }

      if (typeof res.data === "object" && res.data !== null) {
        const entries = (res.data as { data?: Array<Record<string, unknown>> }).data ?? [];
        return entries.map(mapJsonToFoodBank);
      }
    }

    logger.warn("IFAN_DATA_URL not set; using directory scrape fallback");

    return this.scrapeDirectoryFallback();
  }

  private async scrapeDirectoryFallback(): Promise<Array<Partial<FoodBank>>> {
    const directoryUrl = "https://www.foodaidnetwork.org.uk";
    const res = await axios.get(directoryUrl, { timeout: 45_000 });
    const $ = cheerio.load(res.data);

    const cards = new Map<string, Partial<FoodBank>>();

    $("a, article, li, div").each((_, el) => {
      const node = $(el);
      const text = node.text().replace(/\s+/g, " ").trim();
      if (!text || text.length < 12) return;
      if (!/food|aid|pantry|bank/i.test(text)) return;

      const name = node.find("h2,h3,h4,strong").first().text().trim() || text.slice(0, 80);
      const href = node.find("a").attr("href") || node.attr("href") || null;
      const website = href
        ? href.startsWith("http")
          ? href
          : `${directoryUrl}${href}`
        : null;

      const email = node.find("a[href^='mailto:']").attr("href")?.replace("mailto:", "") || null;
      const phone = node.find("a[href^='tel:']").text().trim() || null;

      cards.set(name.toLowerCase(), {
        name,
        organisation: "Independent Food Aid Network",
        address: text,
        email,
        phone,
        website,
        source: "ifan"
      });
    });

    return Array.from(cards.values());
  }
}
