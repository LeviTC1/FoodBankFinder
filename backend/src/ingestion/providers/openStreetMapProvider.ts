import axios from "axios";
import type { FoodBank } from "@foodbankfinder/shared";
import { config } from "../../config.js";
import type { IngestionProvider } from "./baseProvider.js";

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const getAddress = (tags: Record<string, string> = {}): string | null => {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = [tags["addr:city"], tags["addr:postcode"]].filter(Boolean).join(", ");
  const address = [street, locality].filter(Boolean).join(", ");
  return address || null;
};

export class OpenStreetMapProvider implements IngestionProvider {
  source = "openstreetmap" as const;

  async fetchRawRecords(): Promise<Array<Partial<FoodBank>>> {
    const query = `
      [out:json][timeout:180];
      area["ISO3166-1"="GB"][admin_level=2]->.uk;
      (
        node["amenity"="food_bank"](area.uk);
        way["amenity"="food_bank"](area.uk);
        relation["amenity"="food_bank"](area.uk);
        node["social_facility"="food_bank"](area.uk);
        way["social_facility"="food_bank"](area.uk);
        relation["social_facility"="food_bank"](area.uk);
      );
      out center tags;
    `;

    const res = await axios.post<OverpassResponse>(config.overpassUrl, query, {
      timeout: 180_000,
      headers: {
        "Content-Type": "text/plain"
      }
    });

    return res.data.elements.map((element) => {
      const tags = element.tags ?? {};
      const lat = element.lat ?? element.center?.lat ?? null;
      const lon = element.lon ?? element.center?.lon ?? null;

      return {
        name: tags.name || tags.operator || "OSM Food Bank",
        organisation: tags.operator || tags.brand || "OpenStreetMap community data",
        address: getAddress(tags),
        postcode: tags["addr:postcode"] || null,
        latitude: lat,
        longitude: lon,
        phone: tags["contact:phone"] || tags.phone || null,
        email: tags["contact:email"] || tags.email || null,
        website: tags["contact:website"] || tags.website || null,
        opening_hours: tags.opening_hours || null,
        notes: tags.description || null,
        source: "openstreetmap"
      } satisfies Partial<FoodBank>;
    });
  }
}
