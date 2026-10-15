import test from "node:test";
import assert from "node:assert/strict";
import { parseAnalysisInput } from "../lib/analysis.ts";

test("analysis validates points, units, travel modes and custom limits", () => {
  for (const value of [500, 800, 1500, 3000, 1250]) {
    assert.deepEqual(parseAnalysisInput({ pointId: "all", value }, "buffer"), { pointId: "all", value, mode: "pedestrian" });
  }
  for (const mode of ["pedestrian", "auto", "bicycle"]) {
    for (const value of [5, 10, 15, 30, 45, 17]) {
      assert.deepEqual(parseAnalysisInput({ pointId: 0, value, mode }, "isochrone"), { pointId: 0, value, mode });
    }
  }
  for (const body of [null, {}, { pointId: -1, value: 500 }, { pointId: 0.5, value: 500 }, { pointId: "0", value: 500 }, { pointId: 0, value: "500" }, { pointId: 0, value: NaN }, { pointId: 0, value: Infinity }, { pointId: "all", value: 0 }, { pointId: "all", value: 50001 }, { pointId: 0, value: 500, mode: "plane" }]) {
    assert.throws(() => parseAnalysisInput(body, "buffer"));
  }
  assert.throws(() => parseAnalysisInput({ pointId: "all", value: 5 }, "isochrone"));
  assert.throws(() => parseAnalysisInput({ pointId: 0, value: 121 }, "isochrone"));
  assert.throws(() => parseAnalysisInput({ pointId: 2147483648, value: 5 }, "isochrone"));
});
