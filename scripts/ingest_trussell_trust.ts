import { IngestionService } from "../backend/src/ingestion/ingestionService";
import { TrussellTrustProvider } from "../backend/src/ingestion/providers/trussellTrustProvider";

const main = async () => {
  const service = new IngestionService();
  const result = await service.run(new TrussellTrustProvider());
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
