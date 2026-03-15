import { pool } from "../backend/src/database/pool";
import { runGiveFoodIngestion } from "../backend/src/ingestion/givefood_ingest";

runGiveFoodIngestion()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
