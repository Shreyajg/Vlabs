export const experiments = [
  {
    id: "pipeflow",
    title: "Flow Through Circular Pipes",
    route: "/experiment/pipeflow-run",
    aim: "To plot the friction factor chart (Moody’s chart) for flow through circular pipes.",
    theory: "When a fluid flows in a steady state through a pipe, energy is dissipated in overcoming friction. The energy dissipated depends on the properties of flowing fluid and the confining pipe and their relative motion. The significant properties of the pipe are their internal diameter, length and roughness ratio (L/D) (Where D is the inside diameter of the pipe and L is the average height of the projections of reference inside the pipe) and of the fluid are its density and viscosity.",
    procedure: ["Keep the bypass valves fully open and the other valves closed and start the pump.", "Select the pipe for which the pressure drop is to be determined and connect the manometer across that pipe. ", "Adjust the flow rate at any required value. ", "Measure the flow rate by collecting the water in the tank for a known period of time. ", "Repeat the experiment for different flow rates and different pipes. ", "Calculate f, NRe, and report"]
  },
  {
    id: "noncircular",
    title: "Flow Through Non-Circular Pipes",
    route: "/experiment/noncircular-run",
    aim: "To study the flow characteristics of a fluid through a non –circular pipe and establish the relationship between friction factor and Reynolds number for various flow conditions.",
    theory: "A Non-circular pipe is simply a square or a rectangular pipe. The friction in the long straight channels of non-circular cross section can be estimated by using the equation for circular pipes if the diameter in the Reynolds number and the definition of friction factor is taken as the equivalent diameter as explained later. Square and rectangular sections are encountered often in industries and study of the behavior of the fluid flow through such channels is of use.",
    procedure: ["Keep the bypass valves fully open and the other valves closed and start the pump.","Select the pipe for which the pressure drop is to be determined and connect the manometer across that pipe.  ", "Adjust the flow rate at any required value. ", "Measure the flow rate by collecting the water in the tank for a known period of time. ", "Repeat the experiment for different flow rates and different pipes."]
  },
  {
    id: "packedbed",
    title: "Flow Through Packed Bed",
    route: "/experiment/packedbed-run",
    aim: ["To verify the relationship between the velocity of the fluid and pressure drop per unit length of packing.", "To verify Ergun’s equation."],
    theory: "A packed bed is a bed of solid particles (of any shape, size, or surface characteristics) through which fluid is passed. Packed beds are used extensively in absorption, distillation and liquid extraction process where large surface area is necessary to provide intimate contact between two phases – gas-liquid or solid-liquid. As the fluid passes through the bed, it does so through empty spaces (Voids) in the bed. The voids form continuous channels through the bed. These channels need not be of same length and diameter. While the flow may be laminar through some channels, it may be turbulent in other channels.",
    procedure: ["Note the dimensions of the packing material and diameter and height of the packed bed. ","Check for and remove any entrapped air bubbles from the manometer.","Keep the bypass valve fully open and inlet valve fully closed. Start the pump and regulate the flow of water through the bypass valve. ","Open the supply valve slowly and adjust for the required flow rate through the packed bed using the Rota meter. When steady state is reached, record the manometer reading. ","Repeat the experiment by slowly varying the flow rate starting from the minimum flow rate and going to a maximum value. ","Calculate fPT, fPE and (NRe)P and report ","Draw the graph of fPT, fPE V/s ( NRe )P on an Ordinary graph sheet. "],    
  },
  {
    id: "fluidizedbed",
    title: "Flow Through Fluidized Bed",
    route: "/experiment/fluidizedbed-run",
    aim:["1. To determine the pressure drop per unit bed length as a function of superficial velocity.", "2. To compare the theoretical and actual minimum fluidization velocities."],
    theory: "A fluidized bed is one in which solid particles are suspended in a fluid stream. Fluid is introduced through a distributor plate, which ensures uniform distribution of the fluid into the bed. The main components of a fluidized bed are a bed of solid particles contained within a cylindrical vessel and a distributor plate through which fluid enters the bed from below. ",
    procedure: ["Fill the water in the sump, keep the bypass valve fully open, main valves is fully closed and start the pump.", "Note down the initial bed height, diameter of the column, particle size, type of particles and their density.", "Open the main valves slowly and allow a very slow rate of water in the apparatus so as to give a small manometric deflection.", "Wait for steady state conditions and note down the flow rate of water by reading the rotameter. Note the pressure drop across the bed from the manometric reading. Also note the bed height. ","Increase the flow rate slowly and repeat the observations keeping the bed in a packed state. ", "At some flow rate the bed begins to expand and this point dote down the bed level and the flow rate. ", "Repeat he experiment for four to five readings in the fluidized bed state. ","Calculate f, Vmf and ( NRe )P and report. ","Draw the graph of ∆P/L versus Vo and ε versus Vo on ordinary graph sheets."]
  },
];  

export default experiments;