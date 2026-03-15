import axios from "axios";
import * as cheerio from "cheerio";

const MAX_WEBSITE_TEXT_LENGTH = 4000;

const normalizeWhitespace = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

const safeUrl = (input: string): string | null => {
  if (!input.trim()) return null;

  if (/^https?:\/\//i.test(input)) {
    try {
      return new URL(input).toString();
    } catch {
      return null;
    }
  }

  try {
    return new URL(`https://${input}`).toString();
  } catch {
    return null;
  }
};

export interface WebsiteContentResult {
  url: string;
  content: string;
  title: string | null;
}

export const fetchWebsiteContent = async (
  website: string
): Promise<WebsiteContentResult | null> => {
  const url = safeUrl(website);
  if (!url) return null;

  const response = await axios.get<string>(url, {
    timeout: 15_000,
    maxRedirects: 5,
    headers: {
      "user-agent":
        "FoodBankFinderBot/1.0 (+https://foodbankfinder.local; enrichment crawler)"
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

  const html = response.data;
  if (typeof html !== "string" || !html.trim()) {
    return null;
  }

  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, svg, img, form, button, iframe, aside").remove();

  const main = $("main, article, [role='main']").first();
  const source = main.length > 0 ? main : $("body");

  const title = normalizeWhitespace($("title").first().text()) || null;
  const content = normalizeWhitespace(source.text()).slice(0, MAX_WEBSITE_TEXT_LENGTH);

  if (!content) return null;

  return {
    url,
    title,
    content
  };
};
