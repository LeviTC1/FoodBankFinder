import { z } from "zod";
import type { Request, Response } from "express";
import { FoodBankService } from "../services/foodBankService";

const listQuerySchema = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().optional(),
  postcode: z.string().optional(),
  open_now: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value == null) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
  referral_required: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value == null) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
  referral_type: z.enum(["required", "soft", "none", "unknown"]).optional(),
  organisation: z.string().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional()
});

const searchQuerySchema = z.object({
  postcode: z.string().optional(),
  city: z.string().optional(),
  town: z.string().optional(),
  organisation: z.string().optional(),
  service: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional()
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().default(10),
  open_now: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value == null) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
  referral_required: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value == null) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
  referral_type: z.enum(["required", "soft", "none", "unknown"]).optional(),
  organisation: z.string().optional(),
  limit: z.coerce.number().optional()
});

const openNearbyQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().default(20),
  limit: z.coerce.number().default(10)
});

const coverageQuerySchema = z.object({
  limit: z.coerce.number().optional()
});

export class FoodBankController {
  private readonly service = new FoodBankService();

  list = async (req: Request, res: Response) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    }

    const data = await this.service.list(parsed.data);
    return res.json(data);
  };

  nearby = async (req: Request, res: Response) => {
    const parsed = nearbyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const result = await this.service.nearby(
      parsed.data.lat,
      parsed.data.lng,
      parsed.data.radius,
      {
        open_now: parsed.data.open_now,
        referral_required: parsed.data.referral_required,
        referral_type: parsed.data.referral_type,
        organisation: parsed.data.organisation,
        limit: parsed.data.limit
      }
    );

    return res.json({ data: result });
  };

  openNearby = async (req: Request, res: Response) => {
    const parsed = openNearbyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const limit = Math.min(50, Math.max(1, parsed.data.limit));
    const result = await this.service.openNearby(
      parsed.data.lat,
      parsed.data.lng,
      parsed.data.radius,
      limit
    );

    return res.json({ data: result });
  };

  byId = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const item = await this.service.getById(id);
    if (!item) {
      return res.status(404).json({ error: "Food bank not found" });
    }

    return res.json({ data: item });
  };

  search = async (req: Request, res: Response) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid search query" });
    }

    const data = await this.service.search(parsed.data);
    return res.json(data);
  };

  stats = async (_req: Request, res: Response) => {
    const stats = await this.service.stats();
    return res.json({ data: stats });
  };

  coverage = async (req: Request, res: Response) => {
    const parsed = coverageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid coverage query" });
    }

    const limit =
      parsed.data.limit == null ? undefined : Math.min(20000, Math.max(1, parsed.data.limit));
    const cells = await this.service.coverage(limit);
    return res.json({ data: cells });
  };

  organisations = async (_req: Request, res: Response) => {
    const organisations = await this.service.organisations();
    return res.json({ data: organisations });
  };
}
