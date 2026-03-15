import type { FoodBank, SourceName } from "@foodbankfinder/shared";
import { pool } from "../backend/src/database/pool.js";
import { FoodBankRepository } from "../backend/src/database/foodBankRepository.js";
import { NormalizationService } from "../backend/src/services/normalizationService.js";

const normalizer = new NormalizationService();
const repository = new FoodBankRepository();

const main = async () => {
  const res = await pool.query(`
    SELECT
      id,
      name,
      organisation,
      address,
      postcode,
      latitude,
      longitude,
      phone,
      email,
      website,
      opening_hours,
      opening_hours_parsed,
      referral_required,
      referral_type,
      notes,
      source
    FROM foodbanks
  `);

  const normalized = res.rows
    .map((row) =>
      normalizer.normalizeRecord(
        row as Partial<FoodBank>,
        ((row.source as string) || "manual") as SourceName
      )
    )
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  const result = await repository.upsertBatch(normalized);
  console.log({ input: res.rowCount, normalized: normalized.length, ...result });
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
