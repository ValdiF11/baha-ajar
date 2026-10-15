import { database } from "@/lib/db";
import { parseAnalysisInput } from "@/lib/analysis";
import { isochroneCacheKey, isValidIsochrone } from "@/lib/isochrone-cache";

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
    const endpoint = process.env.VALHALLA_URL.replace(/\/$/, "");
    const cacheKey = isochroneCacheKey(endpoint, [lon, lat], input.mode, input.value);
    try {
      const [cached] = await sql`SELECT geojson FROM isochrone_cache WHERE cache_key = ${cacheKey} AND expires_at > now()`;
      if (cached && isValidIsochrone(cached.geojson)) {
        return Response.json(cached.geojson, { headers: { "X-Isochrone-Cache": "HIT" } });
      }
    } catch {
      // A cache outage must not prevent a fresh calculation.
    }
    const response = await fetch(`${endpoint}/isochrone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Id": "baha-ajar" },
      body: JSON.stringify({ locations: [{ lat, lon }], costing: input.mode, contours: [{ time: input.value }], polygons: true, denoise: 0.1 }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
      cache: "no-store",
    });
    if (!response.ok) {
      return Response.json({ error: response.status === 429 ? "Layanan isochrone sedang membatasi permintaan. Tunggu sebentar lalu coba lagi." : "Layanan isochrone gagal menghitung wilayah. Coba titik atau waktu lain." }, { status: response.status === 429 ? 429 : 502 });
    }
    const data = await response.json();
    if (!isValidIsochrone(data)) {
      return Response.json({ error: "Hasil isochrone tidak berisi wilayah yang valid." }, { status: 502 });
    }
    let cacheStatus = "MISS";
    try {
      await sql`INSERT INTO isochrone_cache (cache_key, geojson, expires_at)
        VALUES (${cacheKey}, ${JSON.stringify(data)}::jsonb, now() + interval '24 hours')
        ON CONFLICT (cache_key) DO UPDATE SET geojson = EXCLUDED.geojson, expires_at = EXCLUDED.expires_at`;
    } catch {
      cacheStatus = "BYPASS";
    }
    return Response.json(data, { headers: { "X-Isochrone-Cache": cacheStatus } });
  } catch {
    return Response.json({ error: "Isochrone belum dapat dihitung. Periksa koneksi lalu coba lagi." }, { status: 503 });
  }
}
