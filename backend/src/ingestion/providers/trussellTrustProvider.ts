import axios from "axios";
import * as cheerio from "cheerio";
import type { FoodBank } from "@foodbankfinder/shared";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import type { IngestionProvider } from "./baseProvider.js";

const parseCsv = (csvText: string): Array<Record<string, string>> => {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cols[index]?.trim() ?? "";
      return acc;
    }, {});
  });
};

const mapToFoodBank = (record: Record<string, string>): Partial<FoodBank> => ({
  name: record.name || record["food bank"] || "Unknown food bank",
  organisation:
    record.organisation || record.network || "Trussell Trust Food Bank Network",
  address: record.address || [record.town, record.county].filter(Boolean).join(", "),
  postcode: record.postcode || null,
  phone: record.phone || record.telephone || null,
  email: record.email || null,
  opening_hours: record.opening_hours || record.hours || null,
  notes: record.referral_requirements || record.referral || null,
  website: record.website || record.url || null,
  source: "trussell_trust"
});

export class TrussellTrustProvider implements IngestionProvider {
  source = "trussell_trust" as const;

  async fetchRawRecords(): Promise<Array<Partial<FoodBank>>> {
    if (config.trussellTrustDataUrl) {
      logger.info({ url: config.trussellTrustDataUrl }, "Fetching Trussell Trust dataset");

      const response = await axios.get<string>(config.trussellTrustDataUrl, {
        timeout: 45_000
      });

      if (typeof response.data === "string" && response.data.trim().startsWith("{")) {
        const parsed = JSON.parse(response.data) as Array<Record<string, string>>;
        return parsed.map(mapToFoodBank);
      }

      if (typeof response.data === "string") {
        return parseCsv(response.data).map(mapToFoodBank);
      }

      if (Array.isArray(response.data)) {
        return (response.data as Array<Record<string, string>>).map(mapToFoodBank);
      }
    }

    logger.warn(
      "TRUSSELL_TRUST_DATA_URL not set; using resilient directory scrape fallback"
    );

    return this.scrapeDirectoryFallback();
  }

  private async scrapeDirectoryFallback(): Promise<Array<Partial<FoodBank>>> {
    const baseUrl = "https://www.trusselltrust.org";
    const indexUrl = `${baseUrl}/get-help/find-a-foodbank/`;

    const indexRes = await axios.get(indexUrl, { timeout: 45_000 });
    const $ = cheerio.load(indexRes.data);

    const links = new Set<string>();
    $("a[href*='food-bank']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const full = href.startsWith("http") ? href : `${baseUrl}${href}`;
      links.add(full);
    });

    const pages = Array.from(links).slice(0, 250);

    const output: Array<Partial<FoodBank>> = [];
    for (const url of pages) {
      try {
        const res = await axios.get(url, { timeout: 30_000 });
        const page = cheerio.load(res.data);

        const name =
          page("h1").first().text().trim() ||
          page("meta[property='og:title']").attr("content") ||
          "Trussell Trust Food Bank";

        const address =
          page("[class*='address']").first().text().trim() ||
          page("address").first().text().trim() ||
          null;

        const phone = page("a[href^='tel:']").first().text().trim() || null;
        const email =
          page("a[href^='mailto:']").first().text().trim() ||
          page("a[href^='mailto:']").first().attr("href")?.replace("mailto:", "") ||
          null;

        const opening_hours = page("[class*='opening']").first().text().trim() || null;

        output.push({
          name,
          organisation: "Trussell Trust Food Bank Network",
          address,
          phone,
          email,
          opening_hours,
          notes: "Referral may be required; verify directly with food bank.",
          website: url,
          source: "trussell_trust"
        });
      } catch (error) {
        logger.warn({ err: error, url }, "Failed to scrape Trussell Trust page");
      }
    }

    return output;
  }
}
