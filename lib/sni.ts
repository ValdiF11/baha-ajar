import proj4 from "proj4";
import type { PopulationCell } from "./population-overlay";

export type AnalysisMethod = "iso" | "sni";

export const sniRules = [
  { radius: 1500, label: "Puskesmas Pembantu dan Balai Pengobatan Lingkungan", populationPerUnit: 30000 },
  { radius: 3000, label: "Puskesmas dan Balai Pengobatan", populationPerUnit: 120000 },
] as const;

export function sniRule(radius: unknown) {
  const rule = sniRules.find((item) => item.radius === radius);
  if (!rule) throw new Error("SNI hanya mendukung radius 1,5 km atau 3 km.");
  return rule;
}

export function assessSniCapacity(population: number, populationPerUnit: number) {
  if (!Number.isFinite(population) || population < 0 || !Number.isSafeInteger(populationPerUnit) || populationPerUnit < 1) {
    throw new Error("Penduduk atau acuan per unit tidak valid.");
  }
  const requiredUnits = Math.ceil(population / populationPerUnit);
  return {
    population,
    overcapacity: population > populationPerUnit,
    utilization: population / populationPerUnit * 100,
    excess: Math.max(0, population - populationPerUnit),
    requiredUnits,
    additionalUnits: Math.max(0, requiredUnits - 1),
  };
}

export type SniCapacityRow = ReturnType<typeof assessSniCapacity> & { pointId: number; label: string };

export type SniFacility = { pointId: number; label: string; coordinates: [number, number] };
export type SniAllocation = { rows: SniCapacityRow[]; allocated: number; unreachable: number; total: number };
const utm48South = "+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs";

export function allocateSniPopulation(cells: PopulationCell[], facilities: SniFacility[], radius: number): SniAllocation {
  const rule = sniRule(radius);
  const sorted = [...facilities].sort((a, b) => a.pointId - b.pointId);
  if (new Set(sorted.map((facility) => facility.pointId)).size !== sorted.length) throw new Error("ID fasilitas harus unik.");
  const projected = sorted.map((facility) => proj4("EPSG:4326", utm48South, facility.coordinates));
  const populations = new Array<number>(sorted.length + 1).fill(0);
  for (const cell of cells) {
    if (!Number.isFinite(cell.population) || cell.population < 0) continue;
    const [x, y] = proj4("EPSG:4326", utm48South, cell.coordinates);
    let closest = sorted.length;
    let bestDistance = Infinity;
    for (let index = 0; index < projected.length; index++) {
      const distance = (x - projected[index][0]) ** 2 + (y - projected[index][1]) ** 2;
      // Equal distances retain the smallest facility ID because facilities are sorted.
      if (distance <= radius ** 2 && distance < bestDistance) {
        closest = index;
        bestDistance = distance;
      }
    }
    populations[closest] += cell.population;
  }
  const total = Math.round(populations.reduce((sum, value) => sum + value, 0));
  // Largest remainders preserve the displayed total across facilities and unreachable cells.
  const rounded = populations.map(Math.floor);
  const remainderOrder = populations.map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => Math.abs(b.fraction - a.fraction) < 1e-9 ? a.index - b.index : b.fraction - a.fraction);
  const remainder = total - rounded.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remainder; index++) rounded[remainderOrder[index].index]++;
  const unreachable = rounded[sorted.length];
  return {
    rows: sorted.map((facility, index) => ({ ...assessSniCapacity(populations[index], rule.populationPerUnit), population: rounded[index], pointId: facility.pointId, label: facility.label })),
    allocated: total - unreachable,
    unreachable,
    total,
  };
}
