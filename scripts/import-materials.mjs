import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";
import { materials } from "../lib/materials.ts";

nextEnv.loadEnvConfig(process.cwd(), true);
assert(process.env.DATABASE_URL, "DATABASE_URL belum diatur.");
const sql = neon(process.env.DATABASE_URL);

// Validate every source before changing the database.
const sources = await Promise.all(materials.map(async (material) => {
  const content = await readFile(new URL(`../Materi/Materi/Bahan/${material.filename}`, import.meta.url));
  const geojson = material.srid ? JSON.parse(content.toString("utf8")) : null;
  if (geojson) {
    assert.equal(geojson.type, "FeatureCollection");
    assert(geojson.features.length > 0);
    assert(geojson.features.every((feature) => feature.type === "Feature" && feature.geometry));
  }
  return { ...material, content, geojson };
}));

await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
await sql`CREATE TABLE IF NOT EXISTS bahan_ajar_materials (
  filename text PRIMARY KEY,
  content bytea NOT NULL,
  geojson jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now()
)`;

await sql.transaction(sources.map(({ filename, content, geojson, srid }) => sql`
  INSERT INTO bahan_ajar_materials (filename, content, geojson)
  VALUES (${filename}, decode(${content.toString("hex")}, 'hex'),
    CASE WHEN ${JSON.stringify(geojson)}::jsonb <> 'null'::jsonb THEN
      jsonb_build_object('type', 'FeatureCollection', 'features', (
        SELECT jsonb_agg(jsonb_build_object(
          'type', 'Feature', 'properties', feature->'properties',
          'geometry', ST_AsGeoJSON(ST_Transform(ST_SetSRID(
            ST_GeomFromGeoJSON((feature->'geometry')::text), ${srid}), 4326))::jsonb
        ) ORDER BY ordinal)
        FROM jsonb_array_elements(${JSON.stringify(geojson)}::jsonb->'features') WITH ORDINALITY AS f(feature, ordinal)
      ))
    ELSE NULL END)
  ON CONFLICT (filename) DO UPDATE SET
    content = EXCLUDED.content, geojson = EXCLUDED.geojson, uploaded_at = now()
`));

// Verify stored originals byte-for-byte and transformed coordinates against Bandung.
for (const source of sources) {
  const [row] = await sql`SELECT encode(content, 'hex') AS hex, geojson FROM bahan_ajar_materials WHERE filename = ${source.filename}`;
  assert.equal(createHash("sha256").update(Buffer.from(row.hex, "hex")).digest("hex"),
    createHash("sha256").update(source.content).digest("hex"));
  if (source.geojson) {
    assert.equal(row.geojson.features.length, source.geojson.features.length);
    function checkCoordinates(coordinates) {
      if (typeof coordinates[0] === "number") {
        assert(coordinates[0] > 107 && coordinates[0] < 108);
        assert(coordinates[1] > -8 && coordinates[1] < -6);
      } else coordinates.forEach(checkCoordinates);
    }
    row.geojson.features.forEach((feature) => checkCoordinates(feature.geometry.coordinates));
  }
  console.log(`Terverifikasi: ${source.filename} (${source.content.length} byte${source.geojson ? `, ${row.geojson.features.length} fitur` : ""})`);
}
