import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

export type PopulationCell = { coordinates: [number, number]; population: number };
export type PopulationSummary = { inside: number; outside: number; total: number; percentage: number };

// shortcut: Pixel-center membership estimates coverage at raster resolution; use area-weighted intersections for finer boundaries.
export function summarizePopulation(cells: PopulationCell[], area: FeatureCollection<Polygon | MultiPolygon>): PopulationSummary {
  let total = 0;
  let inside = 0;
  for (const cell of cells) {
    if (!Number.isFinite(cell.population) || cell.population < 0) continue;
    total += cell.population;
    // Test the union by membership so overlapping facilities never count a cell twice.
    if (area.features.some((feature) => booleanPointInPolygon(cell.coordinates, feature))) inside += cell.population;
  }
  const roundedTotal = Math.round(total);
  const roundedInside = Math.round(inside);
  return {
    inside: roundedInside,
    outside: roundedTotal - roundedInside,
    total: roundedTotal,
    percentage: total > 0 ? inside / total * 100 : 0,
  };
}
