import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertUnit,
  isSupportedUnit,
  normalizeUnitSymbol,
  UnitConversionError,
} from "../units";

describe("convertUnit", () => {
  it("converts length", () => {
    assert.equal(convertUnit(25, "mm", "m"), 0.025);
    assert.equal(convertUnit(1, "m", "cm"), 100);
    assert.equal(convertUnit(10, "cm", "mm"), 100);
  });

  it("converts area", () => {
    assert.equal(convertUnit(10000, "cm²", "m²"), 1);
    assert.equal(convertUnit(1, "m²", "mm²"), 1e6);
  });

  it("converts density", () => {
    assert.equal(convertUnit(1, "g/cm³", "kg/m³"), 1000);
    assert.equal(convertUnit(1000, "kg/m³", "g/cm³"), 1);
  });

  it("converts dynamic viscosity, treating kg/m·s as Pa·s", () => {
    assert.equal(convertUnit(1, "cP", "Pa·s"), 0.001);
    assert.equal(convertUnit(0.001, "Pa·s", "cP"), 1);
    assert.equal(convertUnit(3, "kg/m·s", "Pa·s"), 3);
  });

  it("converts volumetric flow", () => {
    assert.equal(convertUnit(60, "LPM", "m³/s"), 0.001);
    assert.equal(convertUnit(3600, "LPH", "m³/s"), 0.001);
    assert.equal(convertUnit(60, "LPM", "LPH"), 3600);
  });

  it("converts pressure and head units", () => {
    assert.equal(convertUnit(10, "mm Hg", "cm Hg"), 1);
    assert.ok(Math.abs(convertUnit(1, "bar", "kg/cm²") - 1e5 / 98066.5) < 1e-9);
  });

  it("passes identical units through unchanged, even when unregistered", () => {
    assert.equal(convertUnit(1500, "rpm", "rpm"), 1500);
    assert.equal(convertUnit(7, "s", "s"), 7);
  });

  it("accepts ASCII spellings of registered units", () => {
    assert.equal(normalizeUnitSymbol("kg/m3"), "kg/m³");
    assert.equal(convertUnit(1, "g/cm3", "kg/m3"), 1000);
    assert.equal(convertUnit(1, "Pa.s", "cP"), 1000);
  });

  it("rejects an unregistered unit with UNSUPPORTED_UNIT", () => {
    assert.throws(
      () => convertUnit(1, "furlong", "m"),
      (error: unknown) =>
        error instanceof UnitConversionError && error.code === "UNSUPPORTED_UNIT",
    );
  });

  it("rejects units of different dimensions with INCOMPATIBLE_UNITS", () => {
    assert.throws(
      () => convertUnit(1, "kg/m³", "m"),
      (error: unknown) =>
        error instanceof UnitConversionError && error.code === "INCOMPATIBLE_UNITS",
    );
  });

  it("rejects the physically meaningless kWh <-> rev/kWh pair found in Firestore", () => {
    assert.throws(
      () => convertUnit(1, "kWh", "rev/kWh"),
      (error: unknown) => error instanceof UnitConversionError,
    );
  });
});

describe("isSupportedUnit", () => {
  it("covers every convertible unit that appears in the Firestore experiments", () => {
    const used = [
      "m", "cm", "mm", "m²", "cm²", "mm²", "kg/m³", "g/cm³",
      "Pa·s", "cP", "kg/m·s", "LPM", "LPH", "m³/s",
      "mm Hg", "cm Hg", "kg/cm²", "bar", "s",
    ];

    for (const unit of used) {
      assert.equal(isSupportedUnit(unit), true, `${unit} should be supported`);
    }
  });

  it("does not register units that have no conversions in the data", () => {
    for (const unit of ["rpm", "rev/kWh", "kWh", "-", "m/s²"]) {
      assert.equal(isSupportedUnit(unit), false, `${unit} should not be registered`);
    }
  });
});
