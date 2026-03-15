import { IngestionService } from "../backend/src/ingestion/ingestionService";
import { OpenStreetMapProvider } from "../backend/src/ingestion/providers/openStreetMapProvider";

const main = async () => {
  const service = new IngestionService();
  const result = await service.run(new OpenStreetMapProvider());
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
