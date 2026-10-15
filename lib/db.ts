import { neon } from "@neondatabase/serverless";

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diatur.");
  return neon(process.env.DATABASE_URL);
}
