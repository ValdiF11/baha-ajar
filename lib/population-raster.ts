import { fromArrayBuffer } from "geotiff";
import type { PopulationCell } from "./population-overlay";

export async function decodePopulationRaster(buffer: ArrayBuffer) {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  if (image.getGeoKeys()?.GeographicTypeGeoKey !== 4326) {
    throw new Error("Koordinat raster penduduk harus WGS84.");
  }
  const values = await image.readRasters({ samples: [0], interleave: true });
  const noData = image.getGDALNoData();
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (Number.isFinite(value) && value !== noData) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min)) throw new Error("Raster penduduk tidak memiliki data valid.");

  const pixels = new Uint8ClampedArray(image.getWidth() * image.getHeight() * 4);
  const cells: PopulationCell[] = [];
  const [originX, originY] = image.getOrigin();
  const [resolutionX, resolutionY] = image.getResolution();
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value) || value === noData) continue;
    if (value >= 0) cells.push({
      coordinates: [originX + (index % image.getWidth() + 0.5) * resolutionX, originY + (Math.floor(index / image.getWidth()) + 0.5) * resolutionY],
      population: value,
    });
    const intensity = max === min ? 0 : (value - min) / (max - min);
    const from = intensity < 0.5 ? [34, 197, 94] : [250, 204, 21];
    const to = intensity < 0.5 ? [250, 204, 21] : [239, 68, 68];
    const blend = intensity < 0.5 ? intensity * 2 : (intensity - 0.5) * 2;
    for (let channel = 0; channel < 3; channel++) {
      pixels[index * 4 + channel] = Math.round(from[channel] + (to[channel] - from[channel]) * blend);
    }
    pixels[index * 4 + 3] = 255;
  }
  const [west, south, east, north] = image.getBoundingBox();
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[west, north], [east, north], [east, south], [west, south]];
  return { pixels, width: image.getWidth(), height: image.getHeight(), coordinates, min, max, cells };
}
