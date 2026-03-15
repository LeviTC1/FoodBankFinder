import { pool, withClient } from "../backend/src/database/pool";
import {
  inferReferralType,
  referralTypeToRequired
} from "../backend/src/utils/referralType";

interface ReferralRow {
  id: number;
  referral_required: boolean | null;
  referral_type: string | null;
  notes: string | null;
  opening_hours: string | null;
  ai_summary: string | null;
}

const main = async () => {
  const result = await pool.query<ReferralRow>(
    `
      SELECT
        id,
        referral_required,
        referral_type,
        notes,
        opening_hours,
        ai_summary
      FROM foodbanks
    `
  );

  let updated = 0;
  const byType: Record<"required" | "soft" | "none" | "unknown", number> = {
    required: 0,
    soft: 0,
    none: 0,
    unknown: 0
  };

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const row of result.rows) {
        const referralType = inferReferralType({
          explicitType: row.referral_type,
          referralRequired: row.referral_required,
          texts: [row.notes, row.opening_hours, row.ai_summary]
        });
        const referralRequired = referralTypeToRequired(referralType);

        byType[referralType] += 1;

        if (
          row.referral_type === referralType &&
          row.referral_required === referralRequired
        ) {
          continue;
        }

        await client.query(
          `
            UPDATE foodbanks
            SET
              referral_type = $2,
              referral_required = $3,
              updated_at = NOW()
            WHERE id = $1
          `,
          [row.id, referralType, referralRequired]
        );
        updated += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  console.log(
    JSON.stringify(
      {
        total: result.rowCount ?? 0,
        updated,
        by_type: byType,
        finished_at: new Date().toISOString()
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
