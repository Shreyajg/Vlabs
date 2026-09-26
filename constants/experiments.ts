export const experiments = [
 {
  id: "pipeflow",
  title: "Flow Through Circular Pipes",
  route: "/experiment/pipeflow-run",
  subjectId: "fluid-mechanics",

  aim: "To plot the friction factor chart (Moody's chart) for flow through circular pipes.",

  theory:
    "When a fluid flows in a steady state through a pipe, energy is dissipated in overcoming friction. The energy dissipated depends on the properties of flowing fluid and the confining pipe and their relative motion. The significant properties of the pipe are its internal diameter, length and roughness ratio (L/D), and of the fluid are its density and viscosity.",

  procedure: [
    "Keep the bypass valves fully open and the other valves closed and start the pump.",
    "Select the pipe for which the pressure drop is to be determined and connect the manometer across that pipe.",
    "Adjust the flow rate to the desired value.",
    "Measure the flow rate by collecting the water in the tank for a known period.",
    "Repeat the experiment for different flow rates and different pipes.",
    "Calculate Reynolds number, friction factor and report the results."
  ],

  inputFields: [
    {
      key: "pipeDiameter",
      label: "Pipe Diameter",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "pipeLength",
      label: "Pipe Length",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm"]
    },
    {
      key: "density",
      label: "Fluid Density",
      type: "number",
      defaultValue: 1000,
      defaultUnit: "kg/m³",
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "viscosity",
      label: "Dynamic Viscosity",
      type: "number",
      defaultValue: 0.001,
      defaultUnit: "Pa·s",
      units: ["Pa·s", "cP"]
    },
    {
      key:"area",
      label:"Area",
      type:"number",
      defaultUnit:"m²",
      units:["m²,cm²"]
    }
  ],

  constants: [
  {
    key: "gravity",
    name: "Acceleration due to Gravity",
    symbol: "g",
    value: 9.81,
    unit: "m/s²"
  },
  {
    key: "manometerDensity",
    name: "Manometer Density",
    symbol: "ρm",
    value: 13600,
    unit: "kg/m³"
  }
],
  formulas: [
  {
    key: "Q",
    name: "Discharge",
    formula: "Q = V/t",
    expression: "area * height / time"
  },
  {
    key: "V",
    name: "Velocity",
    formula: "V = Q/A",
    expression: "Q / area"
  },
  {
    key: "NRe",
    name: "Reynolds Number",
    formula: "Re = ρVD/μ",
    expression: "density * V * pipeDiameter / viscosity"
  },
  {
  key: "Rm",
  name: "Manometer Difference",
  formula: "Rm = (LHS - RHS) / 100",
  expression: "(lhs - rhs) / 100",
},
{
  key: "deltaP",
  name: "Pressure Difference",
  formula: "ΔP = Rm(ρm - ρ)g",
  expression: "Rm * (manometerDensity - density) * gravity",
},
  {
    key: "f",
    name: "Friction Factor",
    formula: "f = (2ΔPD)/(ρLV²)",
    expression:
      "(2 * deltaP * pipeDiameter) / (density * pipeLength * V * V)"
  }
],
  runInputs: [
  {
    "key": "lhs",
    "label": "LHS"
  },
  {
    "key": "rhs",
    "label": "RHS"
  },
  {
    "key": "height",
    "label": "Height"
  },
  {
    "key": "time",
    "label": "Time"
  }
],
outputs: [
  {
    key: "deltaP",
    label: "ΔP",
    decimals: 2,
  },
  {
    key: "Q",
    label: "Q",
    decimals: 6,
  },
  {
    key: "V",
    label: "V",
    decimals: 4,
  },
  {
    key: "NRe",
    label: "Re",
    decimals: 0,
  },
  {
    key: "f",
    label: "f",
    decimals: 4,
  },
],
graph: {
  title: "f vs NRe",
  xKey: "NRe",
  yKey: "f",
  xLabel: "N_Re",
  yLabel: "f",
  scale: "log"
},

  isPublished: true,
  createdBy: "admin"
},
  {
  id: "noncircular",
  title: "Flow Through Non-Circular Pipes",
  route: "/experiment/noncircular-run",
  subjectId: "fluid-mechanics",

  aim: "To study the flow characteristics of a fluid through a non-circular pipe and establish the relationship between friction factor and Reynolds number for various flow conditions.",

  theory:
    "A non-circular pipe is simply a square or rectangular pipe. The friction in long straight channels of non-circular cross section can be estimated using the equations for circular pipes by replacing the diameter with the equivalent (hydraulic) diameter. Such channels are widely encountered in industries and their flow characteristics are important for engineering applications.",

  procedure: [
    "Keep the bypass valves fully open and the other valves closed and start the pump.",
    "Select the non-circular pipe and connect the manometer across the test section.",
    "Adjust the flow rate to the required value.",
    "Measure the flow rate by collecting water in the measuring tank for a known period of time.",
    "Repeat the experiment for different flow rates.",
    "Calculate pressure drop, Reynolds number and friction factor."
  ],

  inputFields: [
    {
      key: "pipeType",
      label: "Pipe Type",
      type: "dropdown",
      options: ["Square", "Rectangular"],
      defaultValue: "Square"
    },
    {
      key: "width",
      label: "Pipe Width",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "breadth",
      label: "Pipe Breadth",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "pipeLength",
      label: "Pipe Length",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm"]
    },
    {
      key: "tankArea",
      label: "Collecting Tank Area",
      type: "number",
      defaultUnit: "m²",
      units: ["m²", "cm²", "mm²"]
    },
    {
      key: "density",
      label: "Fluid Density",
      type: "number",
      defaultValue: 1000,
      defaultUnit: "kg/m³",
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "viscosity",
      label: "Dynamic Viscosity",
      type: "number",
      defaultValue: 0.001,
      defaultUnit: "Pa·s",
      units: ["Pa·s", "cP"]
    }
  ],

  // The manual's observation table. lhs and rhs are read in mm; calculationUnit "m" makes the engine
  // convert them once before any formula runs, so "Rm = lhs - rhs" is already in metres.
  runInputs: [
    {
      key: "lhs",
      label: "LHS",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"],
      calculationUnit: "m"
    },
    {
      key: "rhs",
      label: "RHS",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"],
      calculationUnit: "m"
    },
    {
      key: "height",
      label: "Height",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "time",
      label: "Time",
      type: "number",
      defaultUnit: "s",
      units: ["s"]
    }
  ],

  constants: [
    {
      key: "gravity",
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    },
    {
      key: "manometerDensity",
      name: "Manometer Fluid Density",
      symbol: "ρm",
      value: 13600,
      unit: "kg/m³"
    }
  ],

  // Formulas run in this order: each result joins the scope for the next one.
  formulas: [
    {
      key: "De",
      name: "Equivalent Diameter",
      formula: "De = 2wb/(w+b)",
      expression: "2 * width * breadth / (width + breadth)"
    },
    {
      key: "Rm",
      name: "Manometer Reading",
      formula: "Rm = LHS − RHS",
      expression: "lhs - rhs"
    },
    {
      key: "deltaP",
      name: "Pressure Difference",
      formula: "ΔP = Rm(ρm−ρ)g",
      expression: "Rm * (manometerDensity - density) * gravity"
    },
    {
      key: "Q",
      name: "Discharge",
      formula: "Q = Ah/t",
      expression: "tankArea * height / time"
    },
    {
      key: "pipeArea",
      name: "Pipe Cross-Sectional Area",
      formula: "A = πDe²/4",
      expression: "pi * De^2 / 4"
    },
    {
      key: "V",
      name: "Velocity",
      formula: "V = Q/A",
      expression: "Q / pipeArea"
    },
    {
      key: "NRe",
      name: "Reynolds Number",
      formula: "Re = DeVρ/μ",
      expression: "De * V * density / viscosity"
    },
    {
      key: "f",
      name: "Friction Factor",
      formula: "f = ΔPDe/(2ρLV²)",
      expression: "deltaP * De / (2 * density * V^2 * pipeLength)"
    }
  ],

  outputs: [
    { key: "Rm", label: "Rm", decimals: 4 },
    { key: "deltaP", label: "ΔP", decimals: 2 },
    { key: "Q", label: "Q", decimals: 6 },
    { key: "V", label: "V", decimals: 4 },
    { key: "f", label: "f", decimals: 4 },
    { key: "NRe", label: "NRe", decimals: 0 }
  ],

  graphConfigs: [
    {
      title: "Friction Factor vs Reynolds Number",
      xAxis: "Reynolds Number (log)",
      yAxis: "Friction Factor (log)",
      type: "line",
      xKey: "NRe",
      yKey: "f",
      scale: "log"
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
  {
  id: "packedbed",
  title: "Flow Through Packed Bed",
  route: "/experiment/packedbed-run",
  subjectId: "fluid-mechanics",

  aim: [
    "To verify the relationship between the velocity of the fluid and pressure drop per unit length of packing.",
    "To verify Ergun's equation."
  ],

  theory:
    "A packed bed is a bed of solid particles through which a fluid is passed. Packed beds are widely used in absorption, distillation and extraction processes because they provide a large surface area for contact between phases. As the fluid flows through the void spaces between particles, pressure drop occurs due to viscous and inertial effects. The relationship between pressure drop and fluid velocity is described by Ergun's equation.",

  procedure: [
    "Note the dimensions of the packing material and the diameter and height of the packed bed.",
    "Check for and remove any entrapped air bubbles from the manometer.",
    "Keep the bypass valve fully open and inlet valve fully closed. Start the pump and regulate the flow of water through the bypass valve.",
    "Open the supply valve slowly and adjust the required flow rate using the rotameter.",
    "Allow steady state to be reached and record the manometer reading.",
    "Repeat the experiment for different flow rates.",
    "Calculate the experimental and theoretical friction factors and Reynolds number.",
    "Plot friction factor versus Reynolds number and verify Ergun's equation."
  ],

  inputFields: [
    {
      key: "columnDiameter",
      label: "Column Diameter",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "columnLength",
      label: "Column Length",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm"]
    },
    {
      key: "particleDiameter",
      label: "Packing Particle Diameter",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "fluidDensity",
      label: "Fluid Density",
      type: "number",
      defaultUnit: "kg/m³",
      defaultValue: 1000,
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "manometerDensity",
      label: "Manometer Fluid Density",
      type: "number",
      defaultUnit: "kg/m³",
      defaultValue: 13600,
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "viscosity",
      label: "Dynamic Viscosity",
      type: "number",
      defaultUnit: "Pa·s",
      defaultValue: 0.001,
      units: ["Pa·s", "cP"]
    }
  ],

  runFields: [
    {
      key: "lhs",
      label: "LHS Manometer Reading",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "mm", "m"],
      calculationUnit: "m"
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "mm", "m"],
      calculationUnit: "m"
    },
    {
      key: "rm",
      label: "Manometer Difference (Optional)",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"],
      optional: true
    },
    {
      key: "flow",
      label: "Flow Rate",
      type: "number",
      defaultUnit: "LPM",
      units: ["LPM", "LPH", "m³/s"],
      calculationUnit: "m³/s"
    }
  ],

  constants: [
    {
      key: "gravity",
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    },
    {
      key: "voidFraction",
      name: "Void Fraction",
      symbol: "ε",
      value: 0.4,
      unit: "-"
    },
    {
      key: "shapeFactor",
      name: "Shape Factor (Raschig rings)",
      symbol: "φs",
      value: 1,
      unit: "-"
    }
  ],

  // Formulas run in this order: each result joins the scope for the next one.
  // The manual's Rm = LHS - RHS is used unless the optional Manometer Difference is entered.
  formulas: [
    {
      key: "Rm",
      name: "Manometer Difference",
      formula: "Rm = LHS − RHS",
      expression: "coalesce(rm, lhs - rhs)"
    },
    {
      key: "A",
      name: "Column Cross-Sectional Area",
      formula: "A = πD²/4",
      expression: "pi * columnDiameter^2 / 4"
    },
    {
      key: "Vo",
      name: "Superficial Velocity",
      formula: "Vo = Q/A",
      expression: "flow / A"
    },
    {
      key: "NRe",
      name: "Reynolds Number",
      formula: "Re = DpVoρ/μ",
      expression: "particleDiameter * Vo * fluidDensity / viscosity"
    },
    {
      key: "fPE",
      name: "Experimental Friction Factor",
      formula: "fPE = 150(1-ε)/Re + 1.75",
      expression: "150 * (1 - voidFraction) / NRe + 1.75"
    },
    {
      key: "deltaPPerLength",
      name: "Pressure Drop per Unit Length",
      formula: "ΔP/L = Rmg(ρm-ρ)/L",
      expression: "Rm * gravity * (manometerDensity - fluidDensity) / columnLength"
    },
    {
      key: "fPT",
      name: "Theoretical Friction Factor",
      formula: "fPT = (ΔP/L)(1/ρ)[ε³/(1-ε)²][Dp/Vo²]φs",
      expression: "deltaPPerLength / fluidDensity * (voidFraction^3 / (1 - voidFraction)^2) * (particleDiameter / Vo^2) * shapeFactor"
    }
  ],

  outputs: [
    { key: "Rm", label: "Rm", decimals: 4 },
    { key: "deltaPPerLength", label: "ΔP/L", decimals: 2 },
    { key: "flow", label: "QAct", decimals: 6 },
    { key: "Vo", label: "Vo", decimals: 4 },
    { key: "NRe", label: "NRe", decimals: 0 },
    { key: "fPE", label: "fPE", decimals: 4 },
    { key: "fPT", label: "fPT", decimals: 4 }
  ],

  // An ordinary (linear) graph, as the manual specifies: both friction factors against NRe.
  graphConfigs: [
    {
      title: "Friction Factor vs Reynolds Number",
      type: "line",
      xAxis: "Reynolds Number",
      yAxis: "Friction Factor",
      xKey: "NRe",
      scale: "linear",
      series: [
        {
          label: "Experimental (fPE)",
          yKey: "fPE"
        },
        {
          label: "Theoretical (fPT)",
          yKey: "fPT"
        }
      ]
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
  {
  id: "fluidizedbed",
  title: "Flow Through Fluidized Bed",
  route: "/experiment/fluidizedbed-run",
  subjectId: "fluid-mechanics",

  aim: [
    "To determine the pressure drop per unit bed length as a function of superficial velocity.",
    "To compare the theoretical and actual minimum fluidization velocities."
  ],

  theory:
    "A fluidized bed is one in which solid particles are suspended in an upward flowing fluid stream. Fluid enters through a distributor plate, ensuring uniform distribution throughout the bed. As the fluid velocity increases, the pressure drop across the bed increases until the particles become suspended. Beyond the minimum fluidization velocity, the bed expands while the pressure drop remains nearly constant.",

  procedure: [
    "Fill the sump with water and keep the bypass valve fully open while keeping the main valve closed.",
    "Start the pump and note the initial bed height, column diameter, particle size and particle density.",
    "Open the main valve slowly to obtain a small manometer deflection.",
    "Allow steady state and record the flow rate, pressure drop and bed height.",
    "Increase the flow rate gradually while the bed remains packed.",
    "Identify the minimum fluidization point and record the corresponding bed height and flow rate.",
    "Repeat the experiment for additional flow rates in the fluidized region.",
    "Calculate friction factor, Reynolds number and minimum fluidization velocity.",
    "Plot ΔP/L vs Vo and ε vs Vo."
  ],

  inputFields: [
    {
      key: "columnDiameter",
      label: "Column Diameter",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "initialBedHeight",
      label: "Initial Bed Height",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "particleDiameter",
      label: "Particle Diameter",
      type: "number",
      defaultValue: 0.006,
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "fluidDensity",
      label: "Fluid Density",
      type: "number",
      defaultValue: 1000,
      defaultUnit: "kg/m³",
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "dynamicViscosity",
      label: "Dynamic Viscosity",
      type: "number",
      defaultValue: 0.001,
      defaultUnit: "Pa·s",
      units: ["Pa·s", "cP"]
    }
  ],

  runFields: [
    {
      key: "lhs",
      label: "LHS Manometer Reading",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "mm", "m"],
      calculationUnit: "m"
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "mm", "m"],
      calculationUnit: "m"
    },
    {
      key: "bedHeight",
      label: "Expanded Bed Height",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "flow",
      label: "Rotameter Reading",
      type: "number",
      defaultUnit: "LPM",
      units: ["LPM", "LPH", "m³/s"],
      calculationUnit: "m³/s"
    }
  ],

  // Manual: DATA table, "Density of Manometer fluid, ρm = 1600 kg/m³ (CCl4)". The stored name for this value
  // was "Particle Density", which was wrong; the value is unchanged. The manual's "Density of Packing" is 1
  // (no unit) and no formula needs it, so no particle density is stored.
  constants: [
    {
      key: "gravity",
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    },
    {
      key: "manometerDensity",
      name: "Manometer Fluid Density",
      symbol: "ρm",
      value: 1600,
      unit: "kg/m³"
    },
    {
      key: "rotameterCorrection",
      name: "Rotameter Correction Factor",
      symbol: "Cf",
      value: 0.66,
      unit: "-"
    },
    {
      key: "initialVoidVolume",
      name: "Initial Void Volume",
      symbol: "Vvoid",
      value: 0.000125,
      unit: "m³"
    }
  ],

  // Formulas run in this order: each result joins the scope for the next one.
  // The rotameter reading is converted to m³/s by its calculationUnit, then corrected by Cf.
  formulas: [
    {
      key: "A",
      name: "Column Cross-Sectional Area",
      formula: "A = πD²/4",
      expression: "pi * columnDiameter^2 / 4"
    },
    {
      key: "epsilon0",
      name: "Initial Bed Voidage",
      formula: "ε₀ = Vvoid/(A·L₀)",
      expression: "initialVoidVolume / (A * initialBedHeight)"
    },
    {
      key: "Rm",
      name: "Manometer Difference",
      formula: "Rm = LHS − RHS",
      expression: "lhs - rhs"
    },
    {
      key: "Qact",
      name: "Actual Flow Rate",
      formula: "Qact = Cf × rotameter reading",
      expression: "flow * rotameterCorrection"
    },
    {
      key: "Vo",
      name: "Superficial Velocity",
      formula: "Vo = Q/A",
      expression: "Qact / A"
    },
    {
      key: "epsilon",
      name: "Bed Voidage",
      formula: "ε = 1 − (L₀/L)(1−ε₀)",
      expression: "1 - (initialBedHeight / bedHeight) * (1 - epsilon0)"
    },
    {
      key: "deltaPPerLength",
      name: "Pressure Drop per Unit Length",
      formula: "ΔP/L = g(ρm−ρf)(1−ε)",
      expression: "gravity * (manometerDensity - fluidDensity) * (1 - epsilon)"
    },
    {
      key: "NRe",
      name: "Reynolds Number",
      formula: "Re = DpVoρ/μ",
      expression: "particleDiameter * Vo * fluidDensity / dynamicViscosity"
    },
    {
      key: "f",
      name: "Friction Factor",
      formula: "f = (ΔP/Lρ)(ε³/(1−ε)²)(Dp/Vo²)",
      expression: "deltaPPerLength / fluidDensity * (epsilon^3 / (1 - epsilon)^2) * (particleDiameter / Vo^2)"
    },
    {
      key: "Vmf",
      name: "Minimum Fluidization Velocity",
      formula: "Vmf = Dp²g(ρm−ρf)εmf³/[150(1−εmf)μf]",
      expression: "particleDiameter^2 * gravity * (manometerDensity - fluidDensity) * epsilon^3 / (150 * (1 - epsilon) * dynamicViscosity)"
    }
  ],

  // The manual's final result table (Rm, ΔP/L, QAct, Vo, ε, NRe, f) plus the theoretical Vmf.
  outputs: [
    { key: "Rm", label: "Rm", decimals: 4 },
    { key: "deltaPPerLength", label: "ΔP/L", decimals: 2 },
    { key: "Qact", label: "QAct", decimals: 7 },
    { key: "Vo", label: "Vo", decimals: 5 },
    { key: "epsilon", label: "ε", decimals: 4 },
    { key: "NRe", label: "NRe", decimals: 2 },
    { key: "f", label: "f", decimals: 4 },
    { key: "Vmf", label: "Vmf", decimals: 7 }
  ],

  // Two ordinary (linear) graphs, as the manual specifies.
  graphConfigs: [
    {
      title: "Pressure Drop per Unit Length vs Superficial Velocity",
      type: "line",
      xAxis: "Superficial Velocity (Vo)",
      yAxis: "ΔP/L",
      xKey: "Vo",
      yKey: "deltaPPerLength",
      scale: "linear"
    },
    {
      title: "Void Fraction vs Superficial Velocity",
      type: "line",
      xAxis: "Superficial Velocity (Vo)",
      yAxis: "Void Fraction (ε)",
      xKey: "Vo",
      yKey: "epsilon",
      scale: "linear"
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
  {
  id: "venturimeter",
  title: "Venturi Meter",
  route: "/experiment/venturi-run",
  subjectId: "fluid-mechanics",

  aim: [
    "To calibrate the given Venturi meter.",
    "To determine its coefficient of discharge.",
    "To study the variation of coefficient of discharge (Cd) with Reynolds number."
  ],

  theory:
    "A Venturi meter is a differential pressure flow measuring device consisting of a converging section, a throat and a diverging section. As fluid flows through the throat, its velocity increases while pressure decreases. The pressure difference between the inlet and throat is measured using a differential manometer and is used to determine the discharge and coefficient of discharge.",

  procedure: [
    "Keep the bypass valve fully open and close all other valves before starting the pump.",
    "Allow water to flow through the Venturi meter and regulate the flow using the control valve.",
    "Remove air bubbles from the manometer and wait until steady flow is achieved.",
    "Record the manometer reading.",
    "Measure the time required for the water level in the collecting tank to rise by a known height.",
    "Repeat the experiment for different flow rates.",
    "Calculate the actual discharge, theoretical discharge, coefficient of discharge and Reynolds number.",
    "Plot Qactual vs Manometer Reading and Cd vs Reynolds Number."
  ],

  inputFields: [
    {
      key: "pipeDiameter",
      label: "Pipe Diameter",
      type: "number",
      defaultUnit: "mm",
      units: ["m", "cm", "mm"],
      calculationUnit: "m"
    },
    {
      key: "throatDiameter",
      label: "Throat Diameter",
      type: "number",
      defaultUnit: "mm",
      units: ["m", "cm", "mm"],
      calculationUnit: "m"
    },
    {
      key: "tankArea",
      label: "Collecting Tank Area",
      type: "number",
      defaultUnit: "m²",
      units: ["m²", "cm²"]
    },
    {
      key: "manometerDensity",
      label: "Manometer Fluid Density",
      type: "number",
      defaultUnit: "kg/m³",
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "fluidDensity",
      label: "Flowing Fluid Density",
      type: "number",
      defaultValue: 1000,
      defaultUnit: "kg/m³",
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "viscosity",
      label: "Dynamic Viscosity",
      type: "number",
      defaultValue: 0.001,
      defaultUnit: "Pa·s",
      units: ["Pa·s", "kg/m·s"]
    }
  ],

  runFields: [
    {
      key: "lhs",
      label: "LHS Manometer Reading",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"],
      calculationUnit: "m"
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"],
      calculationUnit: "m"
    },
    {
      key: "height",
      label: "Water Collected Height",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "time",
      label: "Collection Time",
      type: "number",
      defaultUnit: "s",
      units: ["s"]
    }
  ],

  constants: [
    {
      key: "gravity",
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    }
  ],

  // The lab manual's formulas (Experiment No. 1), in dependency order: each result joins the scope for the next.
  // lhs and rhs arrive in metres (calculationUnit), so Rm = lhs - rhs is already in metres.
  // Each "checks" entry is a domain rule for values the equations cannot handle (a zero or negative diameter,
  // a negative head, ...); it is checked before the formula runs and gives the student a clear message.
  formulas: [
    {
      key: "A_pipe",
      name: "Pipe Cross-Sectional Area",
      formula: "A_pipe = πD_pipe²/4",
      expression: "pi * pipeDiameter^2 / 4",
      checks: [
        { expression: "pipeDiameter", rule: "positive", field: "pipeDiameter", message: "Pipe Diameter must be greater than zero." }
      ]
    },
    {
      key: "A_throat",
      name: "Throat Cross-Sectional Area",
      formula: "A_throat = πD_throat²/4",
      expression: "pi * throatDiameter^2 / 4",
      checks: [
        { expression: "throatDiameter", rule: "positive", field: "throatDiameter", message: "Throat Diameter must be greater than zero." }
      ]
    },
    {
      key: "beta",
      name: "Diameter Ratio",
      formula: "β = D_throat/D_pipe",
      expression: "throatDiameter / pipeDiameter",
      checks: [
        { expression: "pipeDiameter - throatDiameter", rule: "positive", field: "throatDiameter", message: "The throat diameter must be smaller than the pipe diameter." }
      ]
    },
    {
      key: "Rm",
      name: "Manometer Reading",
      formula: "Rm = LHS − RHS",
      expression: "lhs - rhs"
    },
    {
      key: "H",
      name: "Fluid Head",
      formula: "H = [(ρm − ρf)/ρf] Rm",
      expression: "((manometerDensity - fluidDensity) / fluidDensity) * Rm",
      checks: [
        { expression: "fluidDensity", rule: "positive", field: "fluidDensity", message: "Flowing Fluid Density must be greater than zero." },
        { expression: "manometerDensity - fluidDensity", rule: "positive", field: "manometerDensity", message: "The manometer fluid must be denser than the flowing fluid." },
        { expression: "Rm", rule: "nonNegative", field: "lhs", message: "The manometer reading Rm (LHS − RHS) is negative, so the head is invalid. Enter the readings so that LHS is not smaller than RHS." }
      ]
    },
    {
      key: "Vthroat",
      name: "Theoretical Throat Velocity",
      formula: "V_throat = √(2gH/(1 − β⁴))",
      expression: "sqrt(2 * gravity * H / (1 - beta^4))",
      checks: [
        { expression: "1 - beta^4", rule: "positive", message: "The throat must be smaller than the pipe: 1 − β⁴ must be greater than zero." },
        { expression: "H", rule: "nonNegative", message: "The head H is negative, so the throat velocity cannot be calculated. Check the manometer readings and densities." }
      ]
    },
    {
      key: "Qth",
      name: "Theoretical Discharge",
      formula: "Q_th = V_throat × A_throat",
      expression: "Vthroat * A_throat"
    },
    {
      key: "Qact",
      name: "Actual Discharge",
      formula: "Q_act = (A_tank × h_tank)/time",
      expression: "tankArea * height / time",
      checks: [
        { expression: "tankArea", rule: "positive", field: "tankArea", message: "Collecting Tank Area must be greater than zero." },
        { expression: "height", rule: "positive", field: "height", message: "Water Collected Height must be greater than zero." },
        { expression: "time", rule: "positive", field: "time", message: "Collection Time must be greater than zero." }
      ]
    },
    {
      key: "Vact",
      name: "Average Pipe Velocity",
      formula: "V_act = Q_act/A_pipe",
      expression: "Qact / A_pipe"
    },
    {
      key: "Cd",
      name: "Coefficient of Discharge",
      formula: "Cd = Q_act/Q_th",
      expression: "Qact / Qth",
      checks: [
        { expression: "Qth", rule: "positive", field: "lhs", message: "The theoretical discharge is zero because Rm is zero, so Cd cannot be calculated. Enter an LHS reading larger than the RHS reading." }
      ]
    },
    {
      key: "NRe",
      name: "Reynolds Number",
      formula: "N_Re = D_pipe V_act ρf/μ",
      expression: "pipeDiameter * Vact * fluidDensity / viscosity",
      checks: [
        { expression: "viscosity", rule: "positive", field: "viscosity", message: "Dynamic Viscosity must be greater than zero." }
      ]
    }
  ],

  // The manual's final result table (Rm, H, QAct, QThe, VThe, VAct, Cd, NRe).
  outputs: [
    { key: "Rm", label: "Rm", decimals: 4 },
    { key: "H", label: "H", decimals: 4 },
    { key: "Qact", label: "QAct", decimals: 6 },
    { key: "Qth", label: "QThe", decimals: 6 },
    { key: "Vthroat", label: "VThe", decimals: 4 },
    { key: "Vact", label: "VAct", decimals: 4 },
    { key: "Cd", label: "Cd", decimals: 4 },
    { key: "NRe", label: "NRe", decimals: 0 }
  ],

  // Manual: "Calibration chart, QAct Vs Rm (Ordinary graph)" and "Cd Vs NRe (Semi Log graph)". In the manual's
  // sketch NRe runs along the horizontal axis on a logarithmic scale and Cd stays linear.
  graphConfigs: [
    {
      title: "Actual Discharge vs Manometer Reading",
      type: "line",
      xAxis: "Manometer Reading (Rm)",
      yAxis: "Actual Discharge (Qact)",
      xKey: "Rm",
      yKey: "Qact",
      scale: "linear"
    },
    {
      title: "Coefficient of Discharge vs Reynolds Number",
      type: "line",
      xAxis: "Reynolds Number (NRe)",
      yAxis: "Coefficient of Discharge (Cd)",
      xKey: "NRe",
      yKey: "Cd",
      scale: "linear",
      xScale: "log",
      yScale: "linear"
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
  {
  id: "orificemeter",
  title: "Orifice Meter",
  route: "/experiment/orifice-run",
  subjectId: "fluid-mechanics",

  aim: [
    "To calibrate the given Orifice meter.",
    "To determine its coefficient of discharge.",
    "To study the variation of coefficient of discharge (Cd) with Reynolds number."
  ],

  theory:
    "An Orifice meter is a differential pressure flow measuring device consisting of a thin plate with a circular opening fitted inside a pipeline. As fluid passes through the orifice, its velocity increases while pressure decreases, producing a pressure difference between the upstream section and the orifice. This pressure difference is measured using a differential manometer and is used to determine the discharge and coefficient of discharge.",

  procedure: [
    "Keep the bypass valve fully open and close all other valves before starting the pump.",
    "Allow water to flow through the Orifice meter and regulate the flow using the control valve.",
    "Remove any trapped air bubbles from the manometer and wait until steady flow is achieved.",
    "Record the manometer reading.",
    "Measure the time required for the water level in the collecting tank to rise by a known height.",
    "Repeat the experiment for different flow rates.",
    "Calculate the actual discharge, theoretical discharge, coefficient of discharge and Reynolds number.",
    "Plot Qactual vs Manometer Reading and Cd vs Reynolds Number."
  ],

  inputFields: [
    {
      key: "pipeDiameter",
      label: "Pipe Diameter",
      type: "number",
      defaultUnit: "mm",
      units: ["m", "cm", "mm"],
      calculationUnit: "m"
    },
    {
      key: "orificeDiameter",
      label: "Orifice Diameter",
      type: "number",
      defaultUnit: "mm",
      units: ["m", "cm", "mm"],
      calculationUnit: "m"
    },
    {
      key: "tankArea",
      label: "Collecting Tank Area",
      type: "number",
      defaultUnit: "m²",
      units: ["m²", "cm²"]
    },
    {
      key: "manometerDensity",
      label: "Manometer Fluid Density",
      type: "number",
      defaultUnit: "kg/m³",
      defaultValue: 13600,
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "fluidDensity",
      label: "Flowing Fluid Density",
      type: "number",
      defaultValue: 1000,
      defaultUnit: "kg/m³",
      units: ["kg/m³", "g/cm³"]
    },
    {
      key: "viscosity",
      label: "Dynamic Viscosity",
      type: "number",
      defaultValue: 0.001,
      defaultUnit: "Pa·s",
      units: ["Pa·s", "kg/m·s"]
    }
  ],

  runFields: [
    {
      key: "lhs",
      label: "LHS Manometer Reading",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"],
      calculationUnit: "m"
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"],
      calculationUnit: "m"
    },
    {
      key: "height",
      label: "Water Collected Height",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "time",
      label: "Collection Time",
      type: "number",
      defaultUnit: "s",
      units: ["s"]
    }
  ],

  constants: [
    {
      key: "gravity",
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    }
  ],

  // The lab manual's formulas (Experiment No. 2), in dependency order: each result joins the scope for the next.
  // lhs and rhs arrive in metres (calculationUnit), so Rm = lhs - rhs is already in metres, and both diameters are
  // in metres too. Each "checks" entry is a domain rule for values the equations cannot handle (a zero diameter, an
  // orifice as wide as the pipe, a zero or negative head, ...); it is checked before the formula runs and gives the
  // student a clear message.
  formulas: [
    {
      key: "Rm",
      name: "Manometer Reading",
      formula: "Rm = LHS - RHS",
      expression: "lhs - rhs"
    },
    {
      key: "H",
      name: "Fluid Head Lost",
      formula: "H = ((ρm - ρf) / ρf) Rm",
      expression: "((manometerDensity - fluidDensity) / fluidDensity) * Rm",
      checks: [
        { expression: "fluidDensity", rule: "positive", field: "fluidDensity", message: "Flowing Fluid Density must be greater than zero." },
        { expression: "manometerDensity", rule: "positive", field: "manometerDensity", message: "Manometer Fluid Density must be greater than zero." },
        { expression: "manometerDensity - fluidDensity", rule: "positive", field: "manometerDensity", message: "The manometer fluid must be denser than the flowing fluid." },
        { expression: "Rm", rule: "nonNegative", field: "lhs", message: "The manometer reading Rm (LHS - RHS) is negative, so the head is invalid. Enter the readings so that LHS is not smaller than RHS." }
      ]
    },
    {
      key: "beta",
      name: "Diameter Ratio",
      formula: "β = Dorifice / Dpipe",
      expression: "orificeDiameter / pipeDiameter",
      checks: [
        { expression: "orificeDiameter", rule: "positive", field: "orificeDiameter", message: "Orifice Diameter must be greater than zero." },
        { expression: "pipeDiameter - orificeDiameter", rule: "positive", field: "orificeDiameter", message: "The orifice diameter must be smaller than the pipe diameter." }
      ]
    },
    {
      key: "Aorifice",
      name: "Orifice Area",
      formula: "Ao = πDo²/4",
      expression: "pi * orificeDiameter^2 / 4"
    },
    {
      key: "QAct",
      name: "Actual Discharge",
      formula: "QAct = ATank × hTank / t",
      expression: "tankArea * height / time",
      checks: [
        { expression: "tankArea", rule: "positive", field: "tankArea", message: "Collecting Tank Area must be greater than zero." },
        { expression: "height", rule: "positive", field: "height", message: "Water Collected Height must be greater than zero." },
        { expression: "time", rule: "positive", field: "time", message: "Collection Time must be greater than zero." }
      ]
    },
    {
      key: "Vorifice",
      name: "Theoretical Orifice Velocity",
      formula: "Vorifice = √(2gH/(1-β⁴))",
      expression: "sqrt((2 * gravity * H) / (1 - beta^4))",
      checks: [
        { expression: "1 - beta^4", rule: "positive", field: "orificeDiameter", message: "The orifice must be smaller than the pipe: 1 - β⁴ must be greater than zero." },
        { expression: "H", rule: "positive", field: "lhs", message: "The head H is zero or negative, so the theoretical velocity cannot be calculated. Enter an LHS reading larger than the RHS reading." }
      ]
    },
    {
      key: "QThe",
      name: "Theoretical Discharge",
      formula: "QThe = Vorifice × Aorifice",
      expression: "Vorifice * Aorifice"
    },
    {
      key: "Cd",
      name: "Coefficient of Discharge",
      formula: "Cd = QAct / QThe",
      expression: "QAct / QThe",
      checks: [
        { expression: "QThe", rule: "positive", message: "The theoretical discharge is not greater than zero, so Cd cannot be calculated. Check the orifice diameter and the manometer readings." }
      ]
    },
    {
      key: "Apipe",
      name: "Pipe Area",
      formula: "Ap = πDpipe²/4",
      expression: "pi * pipeDiameter^2 / 4",
      checks: [
        { expression: "pipeDiameter", rule: "positive", field: "pipeDiameter", message: "Pipe Diameter must be greater than zero." }
      ]
    },
    {
      key: "VAct",
      name: "Actual Pipe Velocity",
      formula: "VAct = QAct / Apipe",
      expression: "QAct / Apipe"
    },
    {
      key: "NRe",
      name: "Reynolds Number",
      formula: "NRe = Dpipe × VAct × ρf / μ",
      expression: "pipeDiameter * VAct * fluidDensity / viscosity",
      checks: [
        { expression: "viscosity", rule: "positive", field: "viscosity", message: "Dynamic Viscosity must be greater than zero." }
      ]
    }
  ],

  // The manual's final result table (Rm, H, QAct, QThe, VOrifice, VAct, Cd, NRe).
  outputs: [
    { key: "Rm", label: "Rm", decimals: 4 },
    { key: "H", label: "H", decimals: 4 },
    { key: "QAct", label: "QAct", decimals: 6 },
    { key: "QThe", label: "QThe", decimals: 6 },
    { key: "Vorifice", label: "VOrifice", decimals: 4 },
    { key: "VAct", label: "VAct", decimals: 4 },
    { key: "Cd", label: "Cd", decimals: 4 },
    { key: "NRe", label: "NRe", decimals: 0 }
  ],

  // Manual: "Calibration chart, QAct Vs Rm (Ordinary graph)" and "Cd Vs NRe (Semi Log graph)". In the manual's
  // sketch NRe runs along the horizontal axis on a logarithmic scale and Cd stays linear.
  graphConfigs: [
    {
      title: "Actual Discharge vs Manometer Reading",
      type: "line",
      xAxis: "Manometer Reading (Rm)",
      yAxis: "Actual Discharge (QAct)",
      xKey: "Rm",
      yKey: "QAct",
      scale: "linear"
    },
    {
      title: "Coefficient of Discharge vs Reynolds Number",
      type: "line",
      xAxis: "Reynolds Number (NRe)",
      yAxis: "Coefficient of Discharge (Cd)",
      xKey: "NRe",
      yKey: "Cd",
      scale: "linear",
      xScale: "log",
      yScale: "linear"
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
  {
  id: "centrifugalpump",
  title: "Centrifugal Pump",
  route: "/experiment/centrifugalpump-run",
  subjectId: "fluid-mechanics",

  aim: "To study the behavior of a centrifugal pump and plot its operating characteristics.",

  theory:
    "A centrifugal pump transfers mechanical energy from a rotating impeller to a liquid, increasing its velocity and pressure. The liquid is forced outward by centrifugal action and delivered at a higher pressure. The performance of the pump is evaluated by studying the relationship between discharge, head, input power and efficiency.",

  procedure: [
    "Connect the power supply, open the suction and delivery valves and fill the sump with water.",
    "Prime the pump and set the required speed.",
    "Switch on the pump and allow water to flow into the collecting tank.",
    "Record the suction head, delivery head and energy meter readings.",
    "Adjust the butterfly valve and measure the collecting tank height and collection time.",
    "Repeat the experiment for different valve openings.",
    "Calculate discharge, total head, input power and efficiency.",
    "Plot the pump operating characteristics."
  ],

  inputFields: [
    {
      key: "tankArea",
      label: "Collecting Tank Area",
      type: "number",
      defaultValue: 0.125,
      defaultUnit: "m²",
      units: ["m²", "cm²"]
    },
    {
      key: "energyMeterConstant",
      label: "Energy Meter Constant",
      type: "number",
      defaultValue: 750,
      defaultUnit: "rev/kWh",
      units: ["rev/kWh"]
    }
  ],

  runFields: [
    {
      key: "rpm",
      label: "Pump Speed",
      type: "number",
      defaultUnit: "rpm",
      units: ["rpm"]
    },
    {
      key: "hs",
      label: "Suction Head",
      type: "number",
      defaultUnit: "mm Hg",
      units: ["mm Hg", "cm Hg"],
      calculationUnit: "mm Hg"
    },
    {
      key: "hd",
      label: "Delivery Head",
      type: "number",
      defaultUnit: "kg/cm²",
      units: ["kg/cm²", "bar"],
      calculationUnit: "kg/cm²"
    },
    {
      key: "energyTime",
      label: "Time for 5 Energy Meter Revolutions",
      type: "number",
      defaultUnit: "s",
      units: ["s"]
    },
    {
      key: "tankHeight",
      label: "Collection Tank Water Height",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "m", "mm"],
      calculationUnit: "m"
    },
    {
      key: "flowTime",
      label: "Collection Time",
      type: "number",
      defaultUnit: "s",
      units: ["s"]
    }
  ],

  constants: [
    {
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    },
    {
      name: "Density of Water",
      symbol: "ρ",
      value: 1000,
      unit: "kg/m³"
    },
    {
      key: "energyMeterRevolutions",
      name: "Energy Meter Revolutions",
      symbol: "k",
      value: 5,
      unit: "revolutions"
    }
  ],

  // The lab manual's formulas (Experiment No. 3), in dependency order: each result joins the scope for the next.
  // The suction head arrives in mm Hg and the delivery head in kg/cm2 (their calculation units), and are converted to
  // metres of water with the manual's own factors (760 mm Hg = 10.32 m of water, 1 kg/cm2 = 10 m of water). The tank
  // height arrives in metres. k, the number of energy meter revolutions, is the constant energyMeterRevolutions.
  // Each "checks" entry is a domain rule for values the equations cannot handle; it is checked before the formula runs
  // and gives the student a clear message.
  formulas: [
    {
      key: "hsWaterHead",
      name: "Suction Head (m of water)",
      formula: "HS (m of water) = HS (mm Hg) × 10.32 / 760",
      expression: "hs * 10.32 / 760",
      checks: [
        { expression: "hs", rule: "nonNegative", field: "hs", message: "Suction Head must not be negative." }
      ]
    },
    {
      key: "hdWaterHead",
      name: "Delivery Head (m of water)",
      formula: "HD (m of water) = HD (kg/cm²) × 10",
      expression: "hd * 10",
      checks: [
        { expression: "hd", rule: "nonNegative", field: "hd", message: "Delivery Head must not be negative." }
      ]
    },
    {
      key: "HT",
      name: "Total Head",
      formula: "HT = HS + HD",
      expression: "hsWaterHead + hdWaterHead"
    },
    {
      key: "Q",
      name: "Discharge",
      formula: "Q = ATank × HTank / t",
      expression: "tankArea * tankHeight / flowTime",
      checks: [
        { expression: "tankArea", rule: "positive", field: "tankArea", message: "Collecting Tank Area must be greater than zero." },
        { expression: "tankHeight", rule: "nonNegative", field: "tankHeight", message: "Collection Tank Water Height must not be negative." },
        { expression: "flowTime", rule: "positive", field: "flowTime", message: "Collection Time must be greater than zero." }
      ]
    },
    {
      key: "IHPTheoretical",
      name: "Theoretical Input Horse Power",
      formula: "Ihp-theoretical = k × 60 × 60 × 1000 / (EMC × 746 × t)",
      expression: "energyMeterRevolutions * 60 * 60 * 1000 / (energyMeterConstant * 746 * energyTime)",
      checks: [
        { expression: "energyMeterConstant", rule: "positive", field: "energyMeterConstant", message: "Energy Meter Constant must be greater than zero." },
        { expression: "energyTime", rule: "positive", field: "energyTime", message: "Time for 5 Energy Meter Revolutions must be greater than zero." }
      ]
    },
    {
      key: "IHPActual",
      name: "Actual Input Horse Power",
      formula: "Ihp-actual = Ihp-theoretical × 0.6",
      expression: "IHPTheoretical * 0.6"
    },
    {
      key: "Ohp",
      name: "Output Horse Power",
      formula: "Ohp = 1000 × Q × HT / 75",
      expression: "1000 * Q * HT / 75"
    },
    {
      key: "eta",
      name: "Pump Efficiency",
      formula: "η (%) = (Ohp / Ihp-actual) × 100",
      expression: "Ohp / IHPActual * 100",
      checks: [
        { expression: "IHPActual", rule: "positive", message: "The actual input horse power is not greater than zero, so the efficiency cannot be calculated. Check the energy meter constant and the energy meter time." }
      ]
    }
  ],

  // The manual's result table (HT, Q, Ihp-Actual, Ohp, efficiency), followed by the two heads in metres of water: the
  // second graph plots the efficiency against them, and a graph can only plot values that are outputs.
  outputs: [
    { key: "HT", label: "Total Head", unit: "m", decimals: 4 },
    { key: "Q", label: "Discharge", unit: "m³/s", decimals: 6 },
    { key: "IHPActual", label: "Input Horse Power", unit: "hp", decimals: 4 },
    { key: "Ohp", label: "Output Horse Power", unit: "hp", decimals: 4 },
    { key: "eta", label: "Pump Efficiency", unit: "%", decimals: 2 },
    { key: "hsWaterHead", label: "Suction Head (m of water)", unit: "m", decimals: 4 },
    { key: "hdWaterHead", label: "Delivery Head (m of water)", unit: "m", decimals: 4 }
  ],

  // Manual: "1. Draw eta (%), IHP-Actual, HT vs Q" and "2. Draw eta (%) vs HD & HS". The first graph plots three
  // series against Q. The second plots the efficiency against the suction head and against the delivery head, so each
  // of its series has its own x variable.
  graphConfigs: [
    {
      title: "Pump Characteristics",
      type: "multi-line",
      xAxis: "Discharge (Q)",
      yAxis: "Head / Power / Efficiency",
      xKey: "Q",
      scale: "linear",
      series: [
        { label: "Efficiency (%)", yKey: "eta" },
        { label: "Input Power (IHP)", yKey: "IHPActual" },
        { label: "Total Head (HT)", yKey: "HT" }
      ]
    },
    {
      title: "Efficiency vs Head",
      type: "multi-line",
      xAxis: "Head (m of water)",
      yAxis: "Efficiency (%)",
      scale: "linear",
      series: [
        { label: "Suction Head", xKey: "hsWaterHead", yKey: "eta" },
        { label: "Delivery Head", xKey: "hdWaterHead", yKey: "eta" }
      ]
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
];  
