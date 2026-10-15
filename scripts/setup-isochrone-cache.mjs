import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
assert(process.env.DATABASE_URL, "DATABASE_URL belum diatur.");
const sql = neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS isochrone_cache (
  cache_key text PRIMARY KEY,
  geojson jsonb NOT NULL,
  expires_at timestamptz NOT NULL
)`;
await sql`DELETE FROM isochrone_cache WHERE expires_at <= now()`;
console.log("Cache isochrone siap. Hasil disimpan selama 24 jam.");
