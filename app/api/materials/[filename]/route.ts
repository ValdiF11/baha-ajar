import { database } from "@/lib/db";
import { materials } from "@/lib/materials";

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const material = materials.find((item) => item.filename === filename);
  if (!material) return Response.json({ error: "Materi tidak ditemukan." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  if (!download && !material.srid) return Response.json({ error: "Materi ini tersedia sebagai unduhan." }, { status: 400 });

  try {
    const sql = database();
    if (download) {
      const [row] = await sql`SELECT encode(content, 'hex') AS hex FROM bahan_ajar_materials WHERE filename = ${filename}`;
      if (!row) return Response.json({ error: "Materi belum diimpor." }, { status: 404 });
      return new Response(Buffer.from(row.hex, "hex"), { headers: {
        "Content-Type": filename.endsWith(".geojson") ? "application/geo+json" : filename.endsWith(".tif") ? "image/tiff" : "application/xml",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      } });
    }
    const [row] = await sql`SELECT geojson FROM bahan_ajar_materials WHERE filename = ${filename}`;
    if (!row) return Response.json({ error: "Materi belum diimpor." }, { status: 404 });
    return Response.json(row.geojson);
  } catch {
    return Response.json({ error: "Materi belum dapat dimuat dari database. Silakan coba lagi." }, { status: 503 });
  }
}
