import test from "node:test";
import assert from "node:assert/strict";
import { summarizePopulation } from "../lib/population-overlay.ts";

const rectangle = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
const polygon = (...rings) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rings } });
const area = (...features) => ({ type: "FeatureCollection", features });
const cells = [
  { coordinates: [1, 1], population: 10.4 },
  { coordinates: [2, 2], population: 20.4 },
  { coordinates: [5, 5], population: 30.4 },
  { coordinates: [0, 0], population: 0 },
  { coordinates: [1, 1], population: -99999 },
  { coordinates: [1, 1], population: NaN },
];

test("overlap counts population once and rounded inside/outside add up to total", () => {
  const shape = polygon(rectangle(0, 0, 3, 3));
  const summary = summarizePopulation(cells, area(shape, shape));
  assert.equal(summary.inside, 31);
  assert.equal(summary.outside, 30);
  assert.equal(summary.total, 61);
  assert.equal(summary.inside + summary.outside, summary.total);
  assert(Math.abs(summary.percentage - 30.8 / 61.2 * 100) < 1e-10);
});

test("holes exclude cells, multipolygons include islands and boundaries count as covered", () => {
  const holed = polygon(rectangle(0, 0, 6, 6), rectangle(1.5, 1.5, 2.5, 2.5));
  assert.equal(summarizePopulation(cells, area(holed)).inside, 41);
  const multi = { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[rectangle(0, 0, 1, 1)], [rectangle(4, 4, 6, 6)]] } };
  assert.equal(summarizePopulation(cells, area(multi)).inside, 41);
});

test("empty, disjoint and full areas produce sensible coverage", () => {
  assert.deepEqual(summarizePopulation([], area()), { inside: 0, outside: 0, total: 0, percentage: 0 });
  assert.equal(summarizePopulation(cells, area()).inside, 0);
  assert.equal(summarizePopulation(cells, area(polygon(rectangle(50, 50, 60, 60)))).outside, 61);
  assert.deepEqual(summarizePopulation(cells, area(polygon(rectangle(-1, -1, 6, 6)))), { inside: 61, outside: 0, total: 61, percentage: 100 });
});
