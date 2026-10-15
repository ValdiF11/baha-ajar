import { database } from "@/lib/db";
import { parseAnalysisInput } from "@/lib/analysis";

export async function POST(request: Request) {
  let input;
  try {
    input = parseAnalysisInput(await request.json(), "isochrone");
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Parameter tidak valid." }, { status: 400 });
  }
  if (!process.env.VALHALLA_URL) {
    return Response.json({ error: "Layanan isochrone belum dikonfigurasi." }, { status: 503 });
  }
  try {
    const sql = database();
    const [row] = await sql`SELECT geojson->'features'->${input.pointId}::int AS feature
      FROM bahan_ajar_materials WHERE filename = 'titik_sarana_kesehatan.geojson'`;
    if (!row?.feature) return Response.json({ error: "Titik fasilitas tidak ditemukan." }, { status: 404 });
    const [lon, lat] = row.feature.geometry.coordinates;
    const response = await fetch(`${process.env.VALHALLA_URL.replace(/\/$/, "")}/isochrone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Id": "baha-ajar" },
      body: JSON.stringify({ locations: [{ lat, lon }], costing: input.mode, contours: [{ time: input.value }], polygons: true, denoise: 0.1 }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok) {
      return Response.json({ error: response.status === 429 ? "Layanan isochrone sedang membatasi permintaan. Tunggu sebentar lalu coba lagi." : "Layanan isochrone gagal menghitung wilayah. Coba titik atau waktu lain." }, { status: response.status === 429 ? 429 : 502 });
    }
    const data = await response.json();
    if (data.type !== "FeatureCollection" || !Array.isArray(data.features) || !data.features.length ||
      !data.features.every((feature: { geometry?: { type?: string; coordinates?: unknown } }) =>
        ["Polygon", "MultiPolygon"].includes(feature.geometry?.type ?? "") && Array.isArray(feature.geometry?.coordinates))) {
      return Response.json({ error: "Hasil isochrone tidak berisi wilayah yang valid." }, { status: 502 });
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "Isochrone belum dapat dihitung. Periksa koneksi lalu coba lagi." }, { status: 503 });
  }
}
