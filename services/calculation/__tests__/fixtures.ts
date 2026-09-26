import { normalizeExperiment } from "../../normalizeExperiment";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import type { QuantityInputs } from "../../../types/Calculation";

/**
 * Raw data in the shape of the real Firestore document
 * subjects/fluid-mechanics/experiments/pipeflow (including its quirks:
 * runInputs instead of runFields, a singular `graph`, and the malformed area unit list).
 */
export const pipeflowRaw: RawExperimentData = {
  id: "pipeflow",
  subjectId: "fluid-mechanics",
  title: "Flow Through Circular Pipes",
  route: "/experiment/pipeflow-run",
  aim: "To plot the friction factor chart (Moody's chart) for flow through circular pipes.",
  theory: "Energy is dissipated in overcoming friction.",
  procedure: ["Start the pump.", "Measure the pressure drop."],
  isPublished: true,
  createdBy: "admin",

  constants: [
    { key: "gravity", name: "Acceleration due to Gravity", symbol: "g", unit: "m/s²", value: 9.81 },
    { key: "manometerDensity", name: "Manometer Density", symbol: "pm", unit: "kg/m³", value: 13600 },
  ],

  inputFields: [
    { key: "pipeDiameter", label: "Pipe Diameter", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
    { key: "pipeLength", label: "Pipe Length", type: "number", defaultUnit: "m", units: ["m", "cm"] },
    { key: "density", label: "Fluid Density", type: "number", defaultUnit: "kg/m³", defaultValue: 1000, units: ["kg/m³", "g/cm³"] },
    { key: "viscosity", label: "Dynamic Viscosity", type: "number", defaultUnit: "Pa·s", defaultValue: 0.001, units: ["Pa·s", "cP"] },
    { key: "area", label: "Area", type: "number", defaultUnit: "m²", units: ["m²,cm²"] },
  ],

  runInputs: [
    { key: "lhs", label: "LHS" },
    { key: "rhs", label: "RHS" },
    { key: "height", label: "Height" },
    { key: "time", label: "Time" },
  ],

  formulas: [
    { key: "Q", name: "Discharge", formula: "Q = V/t", expression: "area * height / time" },
    { key: "V", name: "Velocity", formula: "V = Q/A", expression: "Q / area" },
    { key: "NRe", name: "Reynolds Number", formula: "Re = ρVD/μ", expression: "density * V * pipeDiameter / viscosity" },
    { key: "Rm", name: "Manometer Difference", formula: "Rm = (LHS - RHS) / 100", expression: "(lhs - rhs) / 100" },
    { key: "deltaP", name: "Pressure Difference", formula: "ΔP = Rm(ρm - ρ)g", expression: "Rm * (manometerDensity - density) * gravity" },
    { key: "f", name: "Friction Factor", formula: "f = (2ΔPD)/(ρLV²)", expression: "(2 * deltaP * pipeDiameter)/(density * pipeLength * V^2)" },
  ],

  outputs: [
    { key: "deltaP", label: "ΔP", decimals: 2 },
    { key: "Q", label: "Q", decimals: 6 },
    { key: "V", label: "V", decimals: 4 },
    { key: "NRe", label: "Re", decimals: 0 },
    { key: "f", label: "f", decimals: 4 },
  ],

  graph: { scale: "log", title: "f vs NRe", xKey: "NRe", xLabel: "N_Re", yKey: "f", yLabel: "f" },
};

/**
 * Raw data in the shape of the real venturimeter document: display-only formulas
 * (no key, no expression), runFields with units, and graphConfigs with only xAxis / yAxis labels.
 */
export const venturiRaw: RawExperimentData = {
  id: "venturimeter",
  subjectId: "fluid-mechanics",
  title: "Venturi Meter",
  route: "/experiment/venturi-run",
  aim: ["To calibrate the given Venturi meter.", "To determine its coefficient of discharge."],
  theory: "A Venturi meter is a differential pressure device.",
  procedure: ["Record the manometer reading."],
  isPublished: true,
  createdBy: "admin",

  constants: [{ name: "Acceleration due to Gravity", symbol: "g", unit: "m/s²", value: 9.81 }],

  inputFields: [
    { key: "pipeDiameter", label: "Pipe Diameter", type: "number", defaultUnit: "mm", units: ["m", "cm", "mm"] },
    { key: "throatDiameter", label: "Throat Diameter", type: "number", defaultUnit: "mm", units: ["m", "cm", "mm"] },
    { key: "tankArea", label: "Collecting Tank Area", type: "number", defaultUnit: "m²", units: ["m²", "cm²"] },
    { key: "manometerDensity", label: "Manometer Fluid Density", type: "number", defaultUnit: "kg/m³", units: ["kg/m³", "g/cm³"] },
    { key: "fluidDensity", label: "Flowing Fluid Density", type: "number", defaultUnit: "kg/m³", defaultValue: 1000, units: ["kg/m³", "g/cm³"] },
    { key: "viscosity", label: "Dynamic Viscosity", type: "number", defaultUnit: "Pa·s", defaultValue: 0.001, units: ["Pa·s", "kg/m·s"] },
  ],

  runFields: [
    { key: "lhs", label: "LHS Manometer Reading", type: "number", defaultUnit: "mm", units: ["mm", "cm", "m"] },
    { key: "rhs", label: "RHS Manometer Reading", type: "number", defaultUnit: "mm", units: ["mm", "cm", "m"] },
    { key: "height", label: "Water Collected Height", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
    { key: "time", label: "Collection Time", type: "number", defaultUnit: "s", units: ["s"] },
  ],

  formulas: [
    { name: "Actual Discharge", formula: "Qactual = Ah/t" },
    { name: "Theoretical Discharge", formula: "Qtheoretical = A₂√(2gh/(1-β⁴))" },
    { name: "Coefficient of Discharge", formula: "Cd = Qactual/Qtheoretical" },
    { name: "Reynolds Number", formula: "Re = ρVD/μ" },
  ],

  graphConfigs: [
    { title: "Actual Discharge vs Manometer Reading", type: "line", xAxis: "Manometer Reading", yAxis: "Actual Discharge" },
    { title: "Coefficient of Discharge vs Reynolds Number", type: "line", xAxis: "Reynolds Number", yAxis: "Coefficient of Discharge" },
  ],
};

export function normalizedPipeflow(): NormalizedExperiment {
  return normalizeExperiment({ id: "pipeflow", subjectId: "fluid-mechanics", data: pipeflowRaw });
}

export function normalizedVenturi(): NormalizedExperiment {
  return normalizeExperiment({ id: "venturimeter", subjectId: "fluid-mechanics", data: venturiRaw });
}

/**
 * A complete set of student entries for pipeflow, deliberately using non-default units
 * (mm and cP) so unit conversion is exercised.
 */
export function pipeflowEntries(): { inputs: QuantityInputs; runValues: QuantityInputs } {
  return {
    inputs: {
      pipeDiameter: { value: "25", unit: "mm" },
      pipeLength: { value: "2", unit: "m" },
      density: { value: "1000", unit: "kg/m³" },
      viscosity: { value: "1", unit: "cP" },
      area: { value: "0.04", unit: "m²" },
    },
    runValues: {
      lhs: { value: "30" },
      rhs: { value: "10" },
      height: { value: "0.1" },
      time: { value: "20" },
    },
  };
}

/** Per-run measurements for pipeflow, as strings the way a student types them. */
export function pipeflowRunValues(
  lhs: number | string,
  rhs: number | string,
  height: number | string,
  time: number | string,
): QuantityInputs {
  return {
    lhs: { value: String(lhs) },
    rhs: { value: String(rhs) },
    height: { value: String(height) },
    time: { value: String(time) },
  };
}

/**
 * Expected pipeflow results for the setup in pipeflowEntries() (25 mm, 2 m, 1000 kg/m³, 1 cP, 0.04 m²),
 * derived by hand from the Firestore expressions using plain arithmetic, not from the engine.
 */
export function expectedPipeflow(lhs: number, rhs: number, height: number, time: number) {
  const area = 0.04;
  const pipeDiameter = 25 / 1000;
  const pipeLength = 2;
  const density = 1000;
  const viscosity = 1 / 1000;
  const gravity = 9.81;
  const manometerDensity = 13600;

  const Q = (area * height) / time;
  const V = Q / area;
  const NRe = (density * V * pipeDiameter) / viscosity;
  const Rm = (lhs - rhs) / 100;
  const deltaP = Rm * (manometerDensity - density) * gravity;
  const f = (2 * deltaP * pipeDiameter) / (density * pipeLength * V ** 2);

  return { Q, V, NRe, Rm, deltaP, f };
}

export function closeTo(actual: number, expected: number, relativeTolerance = 1e-9): boolean {
  const scale = Math.max(Math.abs(expected), 1e-12);

  return Math.abs(actual - expected) <= relativeTolerance * scale;
}
