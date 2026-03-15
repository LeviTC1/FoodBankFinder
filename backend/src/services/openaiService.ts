import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config";

const extractionSchema = z.object({
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  opening_hours: z.string().nullable().optional(),
  services: z.array(z.string()).nullable().optional(),
  summary: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export type FoodBankAiExtraction = z.infer<typeof extractionSchema>;

const defaultEmpty: FoodBankAiExtraction = {
  phone: null,
  email: null,
  opening_hours: null,
  services: null,
  summary: null,
  confidence: 0
};

const sanitize = (value?: string | null): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned : null;
};

const sanitizeServices = (services?: string[] | null): string[] | null => {
  if (!services || !services.length) return null;
  const deduped = Array.from(
    new Set(
      services
        .map((service) => sanitize(service))
        .filter((service): service is string => Boolean(service))
    )
  );

  return deduped.length ? deduped : null;
};

const toText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export class OpenAIService {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor() {
    this.model = config.openAiModel;
    this.client = config.openAiApiKey
      ? new OpenAI({ apiKey: config.openAiApiKey })
      : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async extractFoodBankInfo(input: {
    name: string;
    organisation?: string | null;
    website: string;
    websiteText: string;
    known?: {
      phone?: string | null;
      email?: string | null;
      opening_hours?: string | null;
      notes?: string | null;
    };
  }): Promise<FoodBankAiExtraction> {
    if (!this.client) {
      return defaultEmpty;
    }

    const prompt = `
You are analysing a UK food bank website.
Extract only facts that are clearly present in the provided text.
Do not invent details.
If unknown, return null or an empty array.

Return JSON with this exact shape:
{
  "phone": string | null,
  "email": string | null,
  "opening_hours": string | null,
  "services": string[] | null,
  "summary": string | null,
  "confidence": number
}

Confidence must be between 0 and 1.
    `.trim();

    const userPayload = {
      foodbank_name: input.name,
      organisation: input.organisation ?? null,
      website: input.website,
      known_fields: {
        phone: input.known?.phone ?? null,
        email: input.known?.email ?? null,
        opening_hours: input.known?.opening_hours ?? null,
        notes: input.known?.notes ?? null
      },
      website_text: input.websiteText
    };

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: JSON.stringify(userPayload)
        }
      ]
    });

    const raw = toText(completion.choices[0]?.message?.content);
    if (!raw) {
      return defaultEmpty;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return defaultEmpty;
    }

    const parsed = extractionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return defaultEmpty;
    }

    return {
      phone: sanitize(parsed.data.phone),
      email: sanitize(parsed.data.email)?.toLowerCase() ?? null,
      opening_hours: sanitize(parsed.data.opening_hours),
      services: sanitizeServices(parsed.data.services),
      summary: sanitize(parsed.data.summary),
      confidence: parsed.data.confidence ?? 0
    };
  }
}
