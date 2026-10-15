import { database } from "@/lib/db";
import { parseAnalysisInput } from "@/lib/analysis";

export async function POST(request: Request) {
  let input;
  try {
    input = parseAnalysisInput(await request.json(), "buffer");
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Parameter tidak valid." }, { status: 400 });
  }
  try {
    const sql = database();
    const [row] = await sql`
      SELECT ST_AsGeoJSON(ST_Transform(ST_UnaryUnion(ST_Collect(
        ST_Buffer(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON((feature->'geometry')::text), 4326), 32748), ${input.value}, 32)
      )), 4326))::jsonb AS geometry, count(*)::int AS point_count
      FROM bahan_ajar_materials,
        jsonb_array_elements(geojson->'features') WITH ORDINALITY AS f(feature, ordinal)
      WHERE filename = 'titik_sarana_kesehatan.geojson'
        AND (${input.pointId === "all"} OR ordinal - 1 = ${input.pointId === "all" ? -1 : input.pointId})
    `;
    if (!row?.geometry) return Response.json({ error: "Titik fasilitas tidak ditemukan." }, { status: 404 });
    return Response.json({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { distance_m: input.value, point_count: row.point_count }, geometry: row.geometry }],
    });
  } catch {
    return Response.json({ error: "Buffer belum dapat dihitung. Silakan coba lagi." }, { status: 503 });
  }
}
