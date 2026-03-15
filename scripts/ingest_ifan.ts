import { IngestionService } from "../backend/src/ingestion/ingestionService";
import { IFANProvider } from "../backend/src/ingestion/providers/ifanProvider";

const main = async () => {
  const service = new IngestionService();
  const result = await service.run(new IFANProvider());
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
