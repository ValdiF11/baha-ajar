import { database } from "@/lib/db";
import { parseAnalysisInput } from "@/lib/analysis";
import { sniRule } from "@/lib/sni";

export async function POST(request: Request) {
  let input;
  let rule;
  try {
    const body = await request.json();
    rule = sniRule(body?.radius);
    input = parseAnalysisInput({ pointId: body?.pointId, value: rule.radius }, "buffer");
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Parameter SNI tidak valid." }, { status: 400 });
  }
  try {
    const sql = database();
    const rows = await sql`
      SELECT (ordinal - 1)::int AS point_id, feature->'properties'->>'NAMOBJ' AS name,
        ST_AsGeoJSON(ST_Transform(ST_Buffer(ST_Transform(
          ST_SetSRID(ST_GeomFromGeoJSON((feature->'geometry')::text), 4326), 32748
        ), ${rule.radius}, 32), 4326))::jsonb AS geometry
      FROM bahan_ajar_materials,
        jsonb_array_elements(geojson->'features') WITH ORDINALITY AS f(feature, ordinal)
      WHERE filename = 'titik_sarana_kesehatan.geojson'
        AND (${input.pointId === "all"} OR ordinal - 1 = ${input.pointId === "all" ? -1 : input.pointId})
      ORDER BY ordinal
    `;
    if (!rows.length) return Response.json({ error: "Titik fasilitas tidak ditemukan." }, { status: 404 });
    return Response.json({ type: "FeatureCollection", features: rows.map((row) => ({
      type: "Feature", id: row.point_id,
      properties: { point_id: row.point_id, label: row.name || `Titik ${String(row.point_id + 1).padStart(2, "0")}`, radius_m: rule.radius, population_per_unit: rule.populationPerUnit },
      geometry: row.geometry,
    })) });
  } catch {
    return Response.json({ error: "Analisis SNI belum dapat dihitung. Silakan coba lagi." }, { status: 503 });
  }
}
