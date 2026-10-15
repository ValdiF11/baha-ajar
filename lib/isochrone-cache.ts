import { createHash } from "node:crypto";

export function isochroneCacheKey(endpoint: string, coordinates: number[], mode: string, minutes: number) {
  return createHash("sha256").update(JSON.stringify({
    version: 1, endpoint: endpoint.replace(/\/$/, ""), coordinates: coordinates.slice(0, 2), mode, minutes, polygons: true, denoise: 0.1,
  })).digest("hex");
}

export function isValidIsochrone(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const collection = data as { type?: string; features?: unknown };
  return collection.type === "FeatureCollection" && Array.isArray(collection.features) && collection.features.length > 0 &&
    collection.features.every((feature: { geometry?: { type?: string; coordinates?: unknown } } | null) =>
      feature && ["Polygon", "MultiPolygon"].includes(feature.geometry?.type ?? "") && Array.isArray(feature.geometry?.coordinates));
}
