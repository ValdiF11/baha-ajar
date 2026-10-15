import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fromArrayBuffer } from "geotiff";
import { decodePopulationRaster } from "../lib/population-raster.ts";

test("raster Bandung preserves georeferencing, population colors and transparent NoData", async () => {
  const bytes = await readFile(new URL("../Materi/Materi/Bahan/penduduk_kota_bandung.tif", import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const raster = await decodePopulationRaster(buffer);
  const original = await (await fromArrayBuffer(buffer)).getImage();
  const values = await original.readRasters({ samples: [0], interleave: true });
  assert.equal(raster.width, 234);
  assert.equal(raster.height, 158);
  assert.equal(raster.min, 0);
  assert(Math.abs(raster.max - 218.062149) < 0.001);
  assert.equal(raster.pixels.length, raster.width * raster.height * 4);
  const [west, south, east, north] = original.getBoundingBox();
  assert.deepEqual(raster.coordinates, [[west, north], [east, north], [east, south], [west, south]]);
  assert(west > 107 && east < 108 && south > -7 && north < -6);
  let valid = 0;
  for (let index = 0; index < values.length; index++) {
    const rgba = Array.from(raster.pixels.slice(index * 4, index * 4 + 4));
    if (values[index] === original.getGDALNoData()) assert.deepEqual(rgba, [0, 0, 0, 0]);
    else {
      valid++;
      assert.equal(rgba[3], 255);
      if (values[index] === raster.min) assert.deepEqual(rgba, [34, 197, 94, 255]);
      if (values[index] === raster.max) assert.deepEqual(rgba, [239, 68, 68, 255]);
    }
  }
  assert.equal(valid, 19614);
  assert.equal(raster.cells.length, valid);
  const [originX, originY] = original.getOrigin();
  const [resolutionX, resolutionY] = original.getResolution();
  let cellIndex = 0;
  for (let index = 0; index < values.length; index++) {
    if (values[index] === original.getGDALNoData()) continue;
    assert.equal(raster.cells[cellIndex].population, values[index]);
    assert.deepEqual(raster.cells[cellIndex].coordinates, [
      originX + (index % raster.width + 0.5) * resolutionX,
      originY + (Math.floor(index / raster.width) + 0.5) * resolutionY,
    ]);
    cellIndex++;
  }
});
