import { Pool } from "pg";
import { config } from "../config.js";

const databaseUrl = config.databaseUrl;
const requiresSsl =
  databaseUrl.includes("render.com") ||
  databaseUrl.includes("onrender.com");

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false
});

export const withClient = async <T>(fn: (client: import("pg").PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};
