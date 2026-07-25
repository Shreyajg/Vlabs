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

  constants: [
    {
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    },
    {
      name: "Manometer Fluid Density",
      symbol: "ρm",
      value: 13600,
      unit: "kg/m³"
    }
  ],

  formulas: [
    {
      name: "Equivalent Diameter",
      formula: "De = 2wb/(w+b)"
    },
    {
      name: "Pressure Difference",
      formula: "ΔP = Rm(ρm−ρ)g"
    },
    {
      name: "Discharge",
      formula: "Q = Ah/t"
    },
    {
      name: "Velocity",
      formula: "V = Q/A"
    },
    {
      name: "Reynolds Number",
      formula: "Re = DeVρ/μ"
    },
    {
      name: "Friction Factor",
      formula: "f = ΔPDe/(2ρLV²)"
    }
  ],
  graphConfigs: [
    {
      title: "Friction Factor vs Reynolds Number",
      xAxis: "Reynolds Number (log)",
      yAxis: "Friction Factor (log)",
      type: "line"
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
      units: ["cm", "mm", "m"]
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "mm", "m"]
    },
    {
      key: "rm",
      label: "Manometer Difference (Optional)",
      type: "number",
      defaultUnit: "m",
      units: ["m", "cm", "mm"]
    },
    {
      key: "flow",
      label: "Flow Rate",
      type: "number",
      defaultUnit: "LPM",
      units: ["LPM", "LPH", "m³/s"]
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
      name: "Void Fraction",
      symbol: "ε",
      value: 0.4,
      unit: "-"
    }
  ],

  formulas: [
    {
      name: "Superficial Velocity",
      formula: "Vo = Q/A"
    },
    {
      name: "Reynolds Number",
      formula: "Re = DpVoρ/μ"
    },
    {
      name: "Experimental Friction Factor",
      formula: "fPE = 150(1-ε)²/(Reε³) + 1.75(1-ε)/ε³"
    },
    {
      name: "Pressure Drop per Unit Length",
      formula: "ΔP/L = Rmg(ρm-ρ)/L"
    },
    {
      name: "Theoretical Friction Factor",
      formula: "fPT = (ΔP/L)Dpε³ / (ρVo²(1-ε))"
    }
  ],

  graphConfigs: [
    {
      title: "Friction Factor vs Reynolds Number",
      type: "line",
      xAxis: "Reynolds Number",
      yAxis: "Friction Factor",
      series: [
        {
          label: "Experimental (fPE)"
        },
        {
          label: "Theoretical (fPT)"
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
      units: ["cm", "mm", "m"]
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "cm",
      units: ["cm", "mm", "m"]
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
      units: ["LPM", "LPH", "m³/s"]
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
      name: "Particle Density",
      symbol: "ρp",
      value: 1600,
      unit: "kg/m³"
    },
    {
      name: "Rotameter Correction Factor",
      symbol: "Cf",
      value: 0.66,
      unit: "-"
    }
  ],

  formulas: [
    {
      name: "Superficial Velocity",
      formula: "Vo = Q/A"
    },
    {
      name: "Bed Voidage",
      formula: "ε = 1 − (L₀/L)(1−ε₀)"
    },
    {
      name: "Pressure Drop per Unit Length",
      formula: "ΔP/L = g(ρp−ρ)(1−ε)"
    },
    {
      name: "Reynolds Number",
      formula: "Re = DpVoρ/μ"
    },
    {
      name: "Friction Factor",
      formula: "f = (ΔP/Lρ)(ε³/(1−ε)²)(Dp/Vo²)"
    }
  ],

  graphConfigs: [
    {
      title: "Pressure Drop per Unit Length vs Superficial Velocity",
      type: "line",
      xAxis: "Superficial Velocity (Vo)",
      yAxis: "ΔP/L"
    },
    {
      title: "Void Fraction vs Superficial Velocity",
      type: "line",
      xAxis: "Superficial Velocity (Vo)",
      yAxis: "Void Fraction (ε)"
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
      units: ["m", "cm", "mm"]
    },
    {
      key: "throatDiameter",
      label: "Throat Diameter",
      type: "number",
      defaultUnit: "mm",
      units: ["m", "cm", "mm"]
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
      units: ["mm", "cm", "m"]
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"]
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
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    }
  ],

  formulas: [
    {
      name: "Actual Discharge",
      formula: "Qactual = Ah/t"
    },
    {
      name: "Theoretical Discharge",
      formula: "Qtheoretical = A₂√(2gh/(1-β⁴))"
    },
    {
      name: "Coefficient of Discharge",
      formula: "Cd = Qactual/Qtheoretical"
    },
    {
      name: "Reynolds Number",
      formula: "Re = ρVD/μ"
    }
  ],

  graphConfigs: [
    {
      title: "Actual Discharge vs Manometer Reading",
      type: "line",
      xAxis: "Manometer Reading",
      yAxis: "Actual Discharge"
    },
    {
      title: "Coefficient of Discharge vs Reynolds Number",
      type: "line",
      xAxis: "Reynolds Number",
      yAxis: "Coefficient of Discharge"
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
      units: ["m", "cm", "mm"]
    },
    {
      key: "orificeDiameter",
      label: "Orifice Diameter",
      type: "number",
      defaultUnit: "mm",
      units: ["m", "cm", "mm"]
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
      units: ["mm", "cm", "m"]
    },
    {
      key: "rhs",
      label: "RHS Manometer Reading",
      type: "number",
      defaultUnit: "mm",
      units: ["mm", "cm", "m"]
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
      name: "Acceleration due to Gravity",
      symbol: "g",
      value: 9.81,
      unit: "m/s²"
    }
  ],

  formulas: [
    {
      name: "Actual Discharge",
      formula: "Qactual = Ah/t"
    },
    {
      name: "Theoretical Discharge",
      formula: "Qtheoretical = Ao√(2gh/(1-β⁴))"
    },
    {
      name: "Coefficient of Discharge",
      formula: "Cd = Qactual/Qtheoretical"
    },
    {
      name: "Reynolds Number",
      formula: "Re = ρVD/μ"
    }
  ],

  graphConfigs: [
    {
      title: "Actual Discharge vs Manometer Reading",
      type: "line",
      xAxis: "Manometer Reading",
      yAxis: "Actual Discharge"
    },
    {
      title: "Coefficient of Discharge vs Reynolds Number",
      type: "line",
      xAxis: "Reynolds Number",
      yAxis: "Coefficient of Discharge"
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
      defaultUnit: "m²",
      units: ["m²", "cm²"]
    },
    {
      key: "energyMeterConstant",
      label: "Energy Meter Constant",
      type: "number",
      defaultUnit: "rev/kWh",
      units: ["rev/kWh", "kWh"]
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
      units: ["mm Hg", "cm Hg"]
    },
    {
      key: "hd",
      label: "Delivery Head",
      type: "number",
      defaultUnit: "kg/cm²",
      units: ["kg/cm²", "bar"]
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
      units: ["cm", "m", "mm"]
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
    }
  ],

  formulas: [
    {
      name: "Discharge",
      formula: "Q = Ah/t"
    },
    {
      name: "Total Head",
      formula: "HT = Hd + Hs + V²/2g"
    },
    {
      name: "Water Horse Power",
      formula: "WHP = ρgQHT"
    },
    {
      name: "Input Horse Power",
      formula: "IHP = (Energy Meter Constant * Revolutions * 3600)/(Time * 1000)"
    },
    {
      name: "Pump Efficiency",
      formula: "η = (WHP/IHP) * 100"
    }
  ],

  graphConfigs: [
    {
      title: "Pump Characteristics",
      type: "multi-line",
      xAxis: "Discharge (Q)",
      yAxis: "Head / Power / Efficiency",
      series: [
        {
          label: "Efficiency (%)"
        },
        {
          label: "Input Power (IHP)"
        },
        {
          label: "Total Head (HT)"
        }
      ]
    },
    {
      title: "Efficiency vs Head",
      type: "multi-line",
      xAxis: "Head",
      yAxis: "Efficiency (%)",
      series: [
        {
          label: "Suction Head"
        },
        {
          label: "Delivery Head"
        }
      ]
    }
  ],

  isPublished: true,
  createdBy: "admin"
},
];  
