export type AnalysisInput = {
  pointId: "all" | number;
  value: number;
  mode: "pedestrian" | "auto" | "bicycle";
};

export function parseAnalysisInput(body: unknown, kind: "buffer" | "isochrone"): AnalysisInput {
  if (!body || typeof body !== "object") throw new Error("Parameter analisis tidak valid.");
  const { pointId, value, mode = "pedestrian" } = body as Record<string, unknown>;
  if (pointId !== "all" && (typeof pointId !== "number" || !Number.isSafeInteger(pointId) || pointId < 0 || pointId > 2147483647)) {
    throw new Error("Pilih semua titik atau satu titik fasilitas.");
  }
  const maximum = kind === "buffer" ? 50000 : 120;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > maximum) {
    throw new Error(kind === "buffer" ? "Jarak buffer harus 1–50.000 meter." : "Waktu isochrone harus 1–120 menit.");
  }
  if (mode !== "pedestrian" && mode !== "auto" && mode !== "bicycle") throw new Error("Moda perjalanan tidak valid.");
  if (kind === "isochrone" && pointId === "all") throw new Error("Isochrone dihitung bertahap per titik.");
  return { pointId, value, mode };
}
