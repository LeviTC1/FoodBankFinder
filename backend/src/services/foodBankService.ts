import type { FoodBankQuery, FoodBankSearchQuery } from "@foodbankfinder/shared";
import {
  FoodBankRepository,
  type NearbyQueryOptions
} from "../database/foodBankRepository";
import { referralAccessibilityRank } from "../utils/referralType";

export class FoodBankService {
  private readonly repository = new FoodBankRepository();

  async list(query: FoodBankQuery) {
    return this.repository.list(query);
  }

  async nearby(
    lat: number,
    lng: number,
    radius: number,
    options?: NearbyQueryOptions
  ) {
    return this.repository.nearby(lat, lng, radius, options);
  }

  async openNearby(lat: number, lng: number, radius: number, limit = 10) {
    const nearby = await this.repository.nearby(lat, lng, radius, {
      limit: Math.max(limit, 200)
    });

    return nearby
      .sort((a, b) => {
        const openScoreA = a.open_now ? 0 : 1;
        const openScoreB = b.open_now ? 0 : 1;
        if (openScoreA !== openScoreB) return openScoreA - openScoreB;

        const referralScoreA = referralAccessibilityRank(a.referral_type);
        const referralScoreB = referralAccessibilityRank(b.referral_type);
        if (referralScoreA !== referralScoreB) return referralScoreA - referralScoreB;

        const distanceA = Number.isFinite(a.distance_km ?? NaN) ? (a.distance_km as number) : 99999;
        const distanceB = Number.isFinite(b.distance_km ?? NaN) ? (b.distance_km as number) : 99999;
        return distanceA - distanceB;
      })
      .slice(0, limit);
  }

  async getById(id: string) {
    return this.repository.byId(id);
  }

  async search(query: FoodBankSearchQuery) {
    return this.repository.search(query);
  }

  async stats() {
    return this.repository.stats();
  }

  async coverage(limit?: number) {
    return this.repository.coverageCells(limit);
  }

  async organisations() {
    return this.repository.distinctOrganisations();
  }
}
