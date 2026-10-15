import test from "node:test";
import assert from "node:assert/strict";
import { sniRule, assessSniCapacity, allocateSniPopulation } from "../lib/sni.ts";

test("SNI locks the two requested radius/population pairs from Table 12", () => {
  assert.equal(sniRule(1500).populationPerUnit, 30000);
  assert.equal(sniRule(3000).populationPerUnit, 120000);
  for (const radius of [500, 800, 4000, "3000", null, undefined, NaN]) assert.throws(() => sniRule(radius));
});

const facilities = [
  { pointId: 1, label: "A", coordinates: [107.60, -6.9] },
  { pointId: 2, label: "B", coordinates: [107.62, -6.9] },
];

test("nearest allocation assigns overlapping cells once and leaves far population unreachable", () => {
  const result = allocateSniPopulation([
    { coordinates: [107.608, -6.9], population: 100 },
    { coordinates: [107.612, -6.9], population: 200 },
    { coordinates: [107.70, -6.9], population: 300 },
    { coordinates: [107.608, -6.9], population: -99999 },
    { coordinates: [107.608, -6.9], population: NaN },
  ], facilities, 1500);
  assert.deepEqual(result.rows.map((row) => row.population), [100, 200]);
  assert.equal(result.allocated, 300);
  assert.equal(result.unreachable, 300);
  assert.equal(result.total, 600);
  assert.equal(result.rows.reduce((sum, row) => sum + row.population, 0) + result.unreachable, result.total);
});

test("equal distances choose smaller ID independently of facility order", () => {
  const samePosition = [{ ...facilities[0], pointId: 9 }, { ...facilities[0], pointId: 0 }];
  const cells = [{ coordinates: [107.60, -6.9], population: 100 }];
  const result = allocateSniPopulation(cells, samePosition, 1500);
  assert.deepEqual(result.rows.map((row) => [row.pointId, row.population]), [[0, 100], [9, 0]]);
  assert.deepEqual(result, allocateSniPopulation(cells, [...samePosition].reverse(), 1500));
});

test("rounding conserves total and allocation does not transfer population away from overcapacity facilities", () => {
  const cells = [
    { coordinates: facilities[0].coordinates, population: 30000.6 },
    { coordinates: facilities[1].coordinates, population: 0.6 },
    { coordinates: [107.70, -6.9], population: 0.6 },
  ];
  const result = allocateSniPopulation(cells, facilities, 1500);
  assert.equal(result.total, 30002);
  assert.equal(result.rows.reduce((sum, row) => sum + row.population, 0) + result.unreachable, result.total);
  assert.equal(result.rows[0].overcapacity, true);
  assert.equal(result.rows[0].additionalUnits, 1);
  assert.equal(result.rows[1].overcapacity, false);
  const empty = allocateSniPopulation(cells, [], 1500);
  assert.equal(empty.allocated, 0);
  assert.equal(empty.unreachable, empty.total);
  assert.throws(() => allocateSniPopulation(cells, [facilities[0], facilities[0]], 1500));
});

test("SNI capacity thresholds and additional facilities assume one existing unit", () => {
  for (const capacity of [30000, 120000]) {
    assert.equal(assessSniCapacity(0, capacity).requiredUnits, 0);
    assert.equal(assessSniCapacity(0, capacity).additionalUnits, 0);
    assert.equal(assessSniCapacity(capacity - 1, capacity).overcapacity, false);
    const exact = assessSniCapacity(capacity, capacity);
    assert.equal(exact.overcapacity, false);
    assert.equal(exact.utilization, 100);
    assert.equal(exact.additionalUnits, 0);
    const over = assessSniCapacity(capacity + 1, capacity);
    assert.equal(over.overcapacity, true);
    assert.equal(over.excess, 1);
    assert.equal(over.additionalUnits, 1);
    assert.equal(assessSniCapacity(capacity * 2, capacity).additionalUnits, 1);
    assert.equal(assessSniCapacity(capacity * 2 + 1, capacity).additionalUnits, 2);
  }
  for (const [population, capacity] of [[-1, 30000], [Infinity, 30000], [NaN, 30000], [1, 0], [1, 1.5]]) assert.throws(() => assessSniCapacity(population, capacity));
});
