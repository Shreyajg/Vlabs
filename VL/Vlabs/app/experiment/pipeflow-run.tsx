import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Link } from "expo-router";
import React from "react";
import Svg, { Line, Circle, Polyline, Text as SvgText } from "react-native-svg";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { VictoryChart, VictoryLine, VictoryAxis } from "victory-native";

// TYPES
type Run = {
  lhs: string;
  rhs: string;
  height: string;
  time: string;
};

type Result = {
  run: number;
  deltaP: number;
  Q: number;
  V: number;
  NRe: number;
  f: number;
};

export default function PipeFlow() {
  // INPUT STATES
  const [diameter, setDiameter] = React.useState<string>("");
  const [length, setLength] = React.useState<string>("");
  const [area, setArea] = React.useState<string>("");
  const [density, setDensity] = React.useState<string>("");
  const [viscosity, setViscosity] = React.useState<string>("");

  // UNIT STATES
  const [diameterUnit, setDiameterUnit] = React.useState<string>("m");
  const [lengthUnit, setLengthUnit] = React.useState<string>("m");
  const [areaUnit, setAreaUnit] = React.useState<string>("m²");
  const [densityUnit, setDensityUnit] = React.useState<string>("kg/m³");
  const [viscosityUnit, setViscosityUnit] = React.useState<string>("kg/m·s");

  // RUN DATA
  const [runs, setRuns] = React.useState<Run[]>([
    { lhs: "", rhs: "", height: "", time: "" },
  ]);

  const addRun = () => {
    setRuns([...runs, { lhs: "", rhs: "", height: "", time: "" }]);
  };

  const updateRun = (
    index: number,
    field: keyof Run,
    value: string
  ) => {
    const updated = [...runs];
    updated[index][field] = value;
    setRuns(updated);
  };

  const [results, setResults] = React.useState<Result[]>([]);

  // UNIT CONVERSIONS
  const convertUnitToM = (unit: string, val: number): number => {
    if (unit === "cm") return val / 100;
    if (unit === "mm") return val / 1000;
    if (unit === "inch") return val * 0.0254;
    if (unit === "ft") return val * 0.3048;
    return val;
  };

  const convertUnitToMsq = (unit: string, val: number): number => {
    if (unit === "cm²") return val / 10000;
    if (unit === "ft²") return val * 0.3048 * 0.3048;
    return val;
  };

  // CALCULATION
  const calculate = () => {
    let D = Number(diameter);
    let L = Number(length);
    let A = Number(area);
    let Den = Number(density);
    let Vis = Number(viscosity);

    if (diameterUnit !== "m") D = convertUnitToM(diameterUnit, D);
    if (lengthUnit !== "m") L = convertUnitToM(lengthUnit, L);
    if (areaUnit !== "m²") A = convertUnitToMsq(areaUnit, A);

    if (densityUnit !== "kg/m³") Den *= 1000;
    if (viscosityUnit !== "kg/m·s") Vis *= 0.001;

    const g = 9.81;
    const rho = 13600;

    let temp: Result[] = [];

    for (let i = 0; i < runs.length; i++) {
      if (Number(runs[i].time) === 0) continue;

      let Rm =
        Math.abs(Number(runs[i].lhs) - Number(runs[i].rhs)) / 100;

      let deltaP = Rm * (rho - Den) * g;
      let Q = (A * Number(runs[i].height)) / Number(runs[i].time);
      let V = Q / ((3.14 * D * D) / 4);
      let NRe = (D * V * Den) / Vis;

      let f = 0;
      if (V !== 0) {
        f = (deltaP * D) / (2 * Den * L * V * V);
      }

      temp.push({
        run: i + 1,
        deltaP,
        Q,
        V,
        NRe,
        f,
      });
    }

    setResults(temp);
  };

  // REGIME FUNCTION (FIXED TYPES)
  const findRegime = (min: number, max: number): string => {
    if (max < 2100) return "Laminar";
    if (min > 4000) return "Turbulent";
    return "Transitional";
  };

  // INFERENCE FUNCTION (FIXED TYPES)
  const getInference = (results: Result[]): string => {
    if (results.length === 0) return "";

    const reynolds = results.map((r) => r.NRe);
    const regime = findRegime(
      Math.min(...reynolds),
      Math.max(...reynolds)
    );

    return `Flow is in ${regime} regime`;
  };

  return (
    <ScrollView style={styles.body}>
      <View style={styles.header}>
        <Link href="/" style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} />
          <Text style={styles.headerTitle}>Pipe Flow Calculator</Text>
        </Link>
      </View>

      {/* INPUTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Constants</Text>

        <TextInput style={styles.input} placeholder="Diameter" onChangeText={setDiameter} />
        <TextInput style={styles.input} placeholder="Length" onChangeText={setLength} />
        <TextInput style={styles.input} placeholder="Area" onChangeText={setArea} />
        <TextInput style={styles.input} placeholder="Density" onChangeText={setDensity} />
        <TextInput style={styles.input} placeholder="Viscosity" onChangeText={setViscosity} />
      </View>

      {/* RUN DATA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Run Data</Text>

        {runs.map((run, i) => (
          <View key={i}>
            <TextInput style={styles.input} placeholder="LHS" onChangeText={(v) => updateRun(i, "lhs", v)} />
            <TextInput style={styles.input} placeholder="RHS" onChangeText={(v) => updateRun(i, "rhs", v)} />
            <TextInput style={styles.input} placeholder="Height" onChangeText={(v) => updateRun(i, "height", v)} />
            <TextInput style={styles.input} placeholder="Time" onChangeText={(v) => updateRun(i, "time", v)} />
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addRun}>
          <Text style={styles.addButtonText}>Add Run</Text>
        </TouchableOpacity>
      </View>

      {/* CALCULATE */}
      <View style={styles.card}>
        <TouchableOpacity style={styles.addButton} onPress={calculate}>
          <Text style={styles.addButtonText}>CALCULATE</Text>
        </TouchableOpacity>
      </View>

     {/* LOG-LOG GRAPH: f vs NRe */}
{results.length > 0 && (() => {
  // Change these values in your graph code:
  const padding = { top: 20, right: 20, bottom: 45, left: 58 }; // more left padding for y-label
  const W = 300; // slightly narrower to fit mobile
  const H = 220; // taller for better proportions
  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;

  // Log scale helpers
  const logMin = (arr) => Math.log10(Math.min(...arr));
  const logMax = (arr) => Math.log10(Math.max(...arr));

  const reValues = results.map(r => r.NRe);
  const fValues = results.map(r => r.f);

  const xMin = logMin(reValues) - 0.2;
  const xMax = logMax(reValues) + 0.2;
  const yMin = logMin(fValues) - 0.2;
  const yMax = logMax(fValues) + 0.2;

  const toX = (val) => ((Math.log10(val) - xMin) / (xMax - xMin)) * innerW;
  const toY = (val) => innerH - ((Math.log10(val) - yMin) / (yMax - yMin)) * innerH;

  // Sort by NRe for line
  const sorted = [...results].sort((a, b) => a.NRe - b.NRe);
  const points = sorted.map(r => `${toX(r.NRe)},${toY(r.f)}`).join(" ");

  // Tick labels
  const reRange = Math.ceil(xMax) - Math.floor(xMin);
  const xTicks = Array.from({ length: reRange + 1 }, (_, i) => Math.floor(xMin) + i);
  const fRange = Math.ceil(yMax) - Math.floor(yMin);
  const yTicks = Array.from({ length: fRange + 1 }, (_, i) => Math.floor(yMin) + i);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Graph: f vs N_Re (Log–Log)</Text>
      <Svg width={W} height={H}>
        {/* Y grid + ticks */}
        {yTicks.map(tick => (
          <React.Fragment key={tick}>
            <Line
              x1={padding.left} y1={padding.top + toY(Math.pow(10, tick))}
              x2={padding.left + innerW} y2={padding.top + toY(Math.pow(10, tick))}
              stroke="#E5E7EB" strokeWidth={1}
            />
            <SvgText
              x={padding.left - 6} y={padding.top + toY(Math.pow(10, tick)) + 4}
              fontSize={9} textAnchor="end" fill="#6B7280"
            >10^{tick}</SvgText>
          </React.Fragment>
        ))}

        {/* X grid + ticks */}
        {xTicks.map(tick => (
          <React.Fragment key={tick}>
            <Line
              x1={padding.left + toX(Math.pow(10, tick))} y1={padding.top}
              x2={padding.left + toX(Math.pow(10, tick))} y2={padding.top + innerH}
              stroke="#E5E7EB" strokeWidth={1}
            />
            <SvgText
              x={padding.left + toX(Math.pow(10, tick))} y={padding.top + innerH + 16}
              fontSize={9} textAnchor="middle" fill="#6B7280"
            >10^{tick}</SvgText>
          </React.Fragment>
        ))}

        {/* Axes */}
        <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke="#374151" strokeWidth={1.5} />
        <Line x1={padding.left} y1={padding.top + innerH} x2={padding.left + innerW} y2={padding.top + innerH} stroke="#374151" strokeWidth={1.5} />

        {/* Trend line */}
        {sorted.length > 1 && (
          <Polyline
            points={sorted.map(r => `${padding.left + toX(r.NRe)},${padding.top + toY(r.f)}`).join(" ")}
            fill="none" stroke="#2563EB" strokeWidth={1.5}
          />
        )}

        {/* Data points */}
        {results.map((r, i) => (
          <Circle
            key={i}
            cx={padding.left + toX(r.NRe)}
            cy={padding.top + toY(r.f)}
            r={4} fill="#2563EB"
          />
        ))}

        {/* Axis labels */}
        <SvgText x={padding.left + innerW / 2} y={H - 2} fontSize={11} textAnchor="middle" fill="#374151">
          N_Re
        </SvgText>
        {/* Y-axis label - fix position */}
<SvgText
  x={10}  // was 12
  y={padding.top + innerH / 2}
  fontSize={11}
  textAnchor="middle"
  fill="#374151"
  transform={`rotate(-90, 10, ${padding.top + innerH / 2})`}
>
  f
</SvgText>
      </Svg>
    </View>
  );
})()}
  
  
      {/* RESULTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Results</Text>

        {results.map((r) => (
          <View key={r.run}>
            <Text>Run {r.run}</Text>
            <Text>ΔP: {r.deltaP.toFixed(2)}</Text>
            <Text>Re: {r.NRe.toFixed(0)}</Text>
            <Text>f: {r.f.toFixed(4)}</Text>
          </View>
        ))}

        <Text>{getInference(results)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    padding: 16,
    backgroundColor: "#F3F4F6",
  },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
    color: "#111827",
  },

  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: "#111827",
  },

  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: "#F9FAFB",
    marginBottom: 10,
  },

  addButton: {
    backgroundColor: "#2563EB",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  addButtonText: {
    color: "white",
    fontWeight: "600",
  },
   graphContainer: {
  height: 250,
},
});