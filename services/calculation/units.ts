// Pure module: unit registry and conversion.
// Only units that actually appear in the Firestore experiments are registered.

type Dimension =
  | "length"
  | "area"
  | "density"
  | "dynamicViscosity"
  | "volumetricFlow"
  | "pressure"
  | "time";

interface UnitDefinition {
  dimension: Dimension;
  /** Multiply a value in this unit by `toBase` to get the dimension's base unit. */
  toBase: number;
}

// Base units: m, m², kg/m³, Pa·s, m³/s, Pa, s.
const UNIT_REGISTRY: Record<string, UnitDefinition> = {
  m: { dimension: "length", toBase: 1 },
  cm: { dimension: "length", toBase: 0.01 },
  mm: { dimension: "length", toBase: 0.001 },

  "m²": { dimension: "area", toBase: 1 },
  "cm²": { dimension: "area", toBase: 1e-4 },
  "mm²": { dimension: "area", toBase: 1e-6 },

  "kg/m³": { dimension: "density", toBase: 1 },
  "g/cm³": { dimension: "density", toBase: 1000 },

  "Pa·s": { dimension: "dynamicViscosity", toBase: 1 },
  cP: { dimension: "dynamicViscosity", toBase: 0.001 },
  "kg/m·s": { dimension: "dynamicViscosity", toBase: 1 },

  "m³/s": { dimension: "volumetricFlow", toBase: 1 },
  LPM: { dimension: "volumetricFlow", toBase: 1e-3 / 60 },
  LPH: { dimension: "volumetricFlow", toBase: 1e-3 / 3600 },

  bar: { dimension: "pressure", toBase: 1e5 },
  "kg/cm²": { dimension: "pressure", toBase: 98066.5 },
  "mm Hg": { dimension: "pressure", toBase: 133.322387415 },
  "cm Hg": { dimension: "pressure", toBase: 1333.22387415 },

  s: { dimension: "time", toBase: 1 },
};

// ASCII spellings of registered units.
const UNIT_ALIASES: Record<string, string> = {
  m2: "m²",
  cm2: "cm²",
  mm2: "mm²",
  "kg/m3": "kg/m³",
  "g/cm3": "g/cm³",
  "Pa.s": "Pa·s",
  "Pa*s": "Pa·s",
  "kg/m.s": "kg/m·s",
  "m3/s": "m³/s",
  "kg/cm2": "kg/cm²",
};

export type UnitConversionErrorCode = "UNSUPPORTED_UNIT" | "INCOMPATIBLE_UNITS";

export class UnitConversionError extends Error {
  readonly code: UnitConversionErrorCode;
  readonly fromUnit: string;
  readonly toUnit: string;

  constructor(code: UnitConversionErrorCode, fromUnit: string, toUnit: string, message: string) {
    super(message);
    this.name = "UnitConversionError";
    this.code = code;
    this.fromUnit = fromUnit;
    this.toUnit = toUnit;
  }
}

export function normalizeUnitSymbol(unit: string): string {
  const trimmed = unit.trim().replace(/\s+/g, " ");
  return UNIT_ALIASES[trimmed] ?? trimmed;
}

export function isSupportedUnit(unit: string): boolean {
  return normalizeUnitSymbol(unit) in UNIT_REGISTRY;
}

export function areSameUnit(a: string, b: string): boolean {
  return normalizeUnitSymbol(a) === normalizeUnitSymbol(b);
}

/**
 * Converts `value` from `fromUnit` to `toUnit`.
 * Identical units pass through unchanged, even if they are not registered.
 * @throws UnitConversionError for unregistered or incompatible units.
 */
export function convertUnit(value: number, fromUnit: string, toUnit: string): number {
  const from = normalizeUnitSymbol(fromUnit);
  const to = normalizeUnitSymbol(toUnit);

  if (from === to) return value;

  const fromDefinition = UNIT_REGISTRY[from];
  const toDefinition = UNIT_REGISTRY[to];

  if (!fromDefinition || !toDefinition) {
    const unknown = !fromDefinition ? fromUnit : toUnit;

    throw new UnitConversionError(
      "UNSUPPORTED_UNIT",
      fromUnit,
      toUnit,
      `Unsupported unit conversion: ${fromUnit} to ${toUnit} ("${unknown}" is not a registered unit).`,
    );
  }

  if (fromDefinition.dimension !== toDefinition.dimension) {
    throw new UnitConversionError(
      "INCOMPATIBLE_UNITS",
      fromUnit,
      toUnit,
      `Unsupported unit conversion: ${fromUnit} (${fromDefinition.dimension}) to ${toUnit} (${toDefinition.dimension}).`,
    );
  }

  const converted = (value * fromDefinition.toBase) / toDefinition.toBase;

  // Trim floating-point noise such as 10.000000000000002.
  return Number(converted.toPrecision(15));
}
