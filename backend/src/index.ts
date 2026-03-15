import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { foodBankRouter } from "./routes/foodbanks";
import { config } from "./config";
import { logger } from "./utils/logger";
import { pool } from "./database/pool";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
    credentials: true
  })
);
app.use(pinoHttp({ logger }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "foodbankfinder-backend" });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error instanceof Error ? error.message : "Database unavailable"
    });
  }
});

app.use("/api/foodbanks", foodBankRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, "Unhandled server error");
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(config.port, () => {
  logger.info(`FoodBankFinder backend listening on http://localhost:${config.port}`);
});
