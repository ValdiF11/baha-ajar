import test from "node:test";
import assert from "node:assert/strict";
import { isochroneCacheKey, isValidIsochrone } from "../lib/isochrone-cache.ts";

test("cache separates coordinates, travel modes, times and providers", () => {
  const key = isochroneCacheKey("https://routing.example", [107.6, -6.9], "pedestrian", 5);
  assert.equal(key, isochroneCacheKey("https://routing.example/", [107.6, -6.9, 0], "pedestrian", 5));
  for (const args of [
    ["https://other.example", [107.6, -6.9], "pedestrian", 5],
    ["https://routing.example", [107.61, -6.9], "pedestrian", 5],
    ["https://routing.example", [107.6, -6.9], "auto", 5],
    ["https://routing.example", [107.6, -6.9], "pedestrian", 10],
  ]) assert.notEqual(key, isochroneCacheKey(...args));
});

test("errors and missing or nonpolygon results are not cacheable", () => {
  for (const data of [null, {}, { error: "failed" }, { type: "FeatureCollection", features: [] }, { type: "FeatureCollection", features: [null] }, { type: "FeatureCollection", features: [{ geometry: { type: "Point", coordinates: [107.6, -6.9] } }] }]) assert.equal(isValidIsochrone(data), false);
  assert.equal(isValidIsochrone({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[107.6, -6.9], [107.61, -6.9], [107.6, -6.91], [107.6, -6.9]]] } }] }), true);
});
