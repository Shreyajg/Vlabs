import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Link } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Line, Circle, Polyline, Text as SvgText } from "react-native-svg";

type Run = {
  lhs: string;
  rhs: string;
  bedHeight: string;
  flow: string;
};

type Result = {
  run: number;
  Rm: number;
  Vo: number;
  epsilon: number;
  deltaPL: number;
   f: number;      // ADD THIS
  NRe: number;    // ADD THIS
};

export default function FluidizedBedRun() {

  // CONSTANT INPUTS
  const [diameter, setDiameter] = React.useState<string>("");
  const [initialHeight, setInitialHeight] = React.useState<string>("");
  const [area, setArea] = React.useState<string>("");
  const [density, setDensity] = React.useState<string>("1000");
  const [viscosity, setViscosity] = React.useState<string>("0.001");

  const [results, setResults] = React.useState<Result[]>([]);

  const [runs, setRuns] = React.useState<Run[]>([
    { lhs: "", rhs: "", bedHeight: "", flow: "" },
  ]);

  const addRun = () => {
    setRuns([...runs, { lhs: "", rhs: "", bedHeight: "", flow: "" }]);
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

  // CALCULATE
  const calculate = () => {
    const g = 9.81;
    const rho_m = 1600; // given

    const D = Number(diameter);
    const A = (Math.PI * D * D) / 4;
    const L0 = Number(initialHeight);
    const epsilon0 = 125e-6 / (A * L0);

    let temp: Result[] = [];

    for (let i = 0; i < runs.length; i++) {
      const lhs = Number(runs[i].lhs);
      const rhs = Number(runs[i].rhs);
      const L = Number(runs[i].bedHeight);
      const flow = Number(runs[i].flow);

      if (flow === 0 || L === 0) continue;

      const Rm = (lhs - rhs) / 100; // cm → m

      const Q = (flow * 0.66 * 1e-3) / 60; // lab manual says actual LPM = rotameter × 0.66

      const Vo = Q / A;

      const epsilon = 1 - (L0 / L) * (1 - epsilon0);

      const deltaPL = g * (rho_m - Number(density)) * (1 - epsilon);
        
        const Dp =0.006; // from lab data, or make it a state input
        
const f = (deltaPL / Number(density)) *
          (Math.pow(epsilon, 3) / Math.pow(1 - epsilon, 2)) *
          (Dp / (Vo * Vo));

const NRe = (Dp * Vo * Number(density)) / Number(viscosity);

temp.push({ run: i+1, Rm, Vo, epsilon, deltaPL, f, NRe });

    }

    setResults(temp);
  };

  return (
    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 60 }}>

      <View style={styles.header}>
        <Link href="/" style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
          <Text style={styles.headerTitle}>Fluidized Bed</Text>
        </Link>
      </View>

      {/* CONSTANTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Constants</Text>

        <TextInput placeholder="Column Diameter (m)" style={styles.input} onChangeText={setDiameter} />
        <TextInput placeholder="Initial Bed Height (Lo)" style={styles.input} onChangeText={setInitialHeight} />
        <TextInput placeholder="Density" style={styles.input} onChangeText={setDensity} />
        <TextInput placeholder="Viscosity" style={styles.input} onChangeText={setViscosity} />
      </View>

      {/* RUN DATA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Run Data</Text>

        {runs.map((run, i) => (
          <View key={i} style={styles.runCard}>
            <Text>Run {i + 1}</Text>

            <TextInput placeholder="LHS" style={styles.input} onChangeText={(v) => updateRun(i, "lhs", v)} />
            <TextInput placeholder="RHS" style={styles.input} onChangeText={(v) => updateRun(i, "rhs", v)} />
            <TextInput placeholder="Bed Height" style={styles.input} onChangeText={(v) => updateRun(i, "bedHeight", v)} />
            <TextInput placeholder="Flow (LPM)" style={styles.input} onChangeText={(v) => updateRun(i, "flow", v)} />
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addRun}>
          <Text style={styles.addButtonText}>Add Data</Text>
        </TouchableOpacity>
      </View>

      {/* CALCULATE */}
      <View style={styles.card}>
        <TouchableOpacity style={styles.addButton} onPress={calculate}>
          <Text style={styles.addButtonText}>CALCULATE</Text>
        </TouchableOpacity>
      </View>
      {/* GRAPH 1 — ΔP/L vs Vo */}
{results.length > 0 && (() => {
  const pad = { top: 20, right: 20, bottom: 45, left: 62 };
  const W = 300, H = 220;
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const sorted = [...results].filter(r => r.Vo > 0).sort((a, b) => a.Vo - b.Vo);
  if (sorted.length === 0) return null;

  const xMin = 0, xMax = Math.max(...sorted.map(r => r.Vo)) * 1.2;
  const yMin = 0, yMax = Math.max(...sorted.map(r => r.deltaPL)) * 1.2;

  const toX = (v: number) => ((v - xMin) / (xMax - xMin)) * iW;
  const toY = (v: number) => iH - ((v - yMin) / (yMax - yMin)) * iH;

  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + (i * (xMax - xMin)) / 4);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i * (yMax - yMin)) / 4);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Graph 1: ΔP/L vs Vo</Text>
      <Svg width={W} height={H}>
        {yTicks.map((t, i) => (
          <Line key={`gy${i}`}
            x1={pad.left} y1={pad.top + toY(t)}
            x2={pad.left + iW} y2={pad.top + toY(t)}
            stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {xTicks.map((t, i) => (
          <Line key={`gx${i}`}
            x1={pad.left + toX(t)} y1={pad.top}
            x2={pad.left + toX(t)} y2={pad.top + iH}
            stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {yTicks.map((t, i) => (
          <SvgText key={`ty${i}`}
            x={pad.left - 5} y={pad.top + toY(t) + 4}
            fontSize={9} textAnchor="end" fill="#6B7280">
            {t.toFixed(1)}
          </SvgText>
        ))}
        {xTicks.map((t, i) => (
          <SvgText key={`tx${i}`}
            x={pad.left + toX(t)} y={pad.top + iH + 14}
            fontSize={9} textAnchor="middle" fill="#6B7280">
            {t.toFixed(4)}
          </SvgText>
        ))}
        <Line x1={pad.left} y1={pad.top}
              x2={pad.left} y2={pad.top + iH}
              stroke="#374151" strokeWidth={1.5} />
        <Line x1={pad.left} y1={pad.top + iH}
              x2={pad.left + iW} y2={pad.top + iH}
              stroke="#374151" strokeWidth={1.5} />
        {sorted.length > 1 && (
          <Polyline
            points={sorted.map(r =>
              `${pad.left + toX(r.Vo)},${pad.top + toY(r.deltaPL)}`
            ).join(" ")}
            fill="none" stroke="#2563EB" strokeWidth={2} />
        )}
        {sorted.map((r, i) => (
          <Circle key={i}
            cx={pad.left + toX(r.Vo)}
            cy={pad.top + toY(r.deltaPL)}
            r={4} fill="#2563EB" />
        ))}
        <SvgText x={pad.left + iW / 2} y={H - 4}
          fontSize={11} textAnchor="middle" fill="#374151">
          Vo (m/s)
        </SvgText>
        <SvgText x={13} y={pad.top + iH / 2}
          fontSize={10} textAnchor="middle" fill="#374151"
          transform={`rotate(-90, 13, ${pad.top + iH / 2})`}>
          ΔP/L
        </SvgText>
      </Svg>
    </View>
  );
})()}

{/* GRAPH 2 — ε vs Vo */}
{results.length > 0 && (() => {
  const pad = { top: 20, right: 20, bottom: 45, left: 58 };
  const W = 300, H = 220;
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const sorted = [...results].filter(r => r.Vo > 0).sort((a, b) => a.Vo - b.Vo);
  if (sorted.length === 0) return null;

  const xMin = 0, xMax = Math.max(...sorted.map(r => r.Vo)) * 1.2;
  const yMin = 0, yMax = 1.0;

  const toX = (v: number) => ((v - xMin) / (xMax - xMin)) * iW;
  const toY = (v: number) => iH - ((v - yMin) / (yMax - yMin)) * iH;

  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + (i * (xMax - xMin)) / 4);
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Graph 2: ε vs Vo</Text>
      <Svg width={W} height={H}>
        {yTicks.map((t, i) => (
          <Line key={`gy${i}`}
            x1={pad.left} y1={pad.top + toY(t)}
            x2={pad.left + iW} y2={pad.top + toY(t)}
            stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {xTicks.map((t, i) => (
          <Line key={`gx${i}`}
            x1={pad.left + toX(t)} y1={pad.top}
            x2={pad.left + toX(t)} y2={pad.top + iH}
            stroke="#E5E7EB" strokeWidth={1} />
        ))}
        {yTicks.map((t, i) => (
          <SvgText key={`ty${i}`}
            x={pad.left - 5} y={pad.top + toY(t) + 4}
            fontSize={9} textAnchor="end" fill="#6B7280">
            {t.toFixed(1)}
          </SvgText>
        ))}
        {xTicks.map((t, i) => (
          <SvgText key={`tx${i}`}
            x={pad.left + toX(t)} y={pad.top + iH + 14}
            fontSize={9} textAnchor="middle" fill="#6B7280">
            {t.toFixed(4)}
          </SvgText>
        ))}
        <Line x1={pad.left} y1={pad.top}
              x2={pad.left} y2={pad.top + iH}
              stroke="#374151" strokeWidth={1.5} />
        <Line x1={pad.left} y1={pad.top + iH}
              x2={pad.left + iW} y2={pad.top + iH}
              stroke="#374151" strokeWidth={1.5} />
        {sorted.length > 1 && (
          <Polyline
            points={sorted.map(r =>
              `${pad.left + toX(r.Vo)},${pad.top + toY(r.epsilon)}`
            ).join(" ")}
            fill="none" stroke="#f97316" strokeWidth={2} />
        )}
        {sorted.map((r, i) => (
          <Circle key={i}
            cx={pad.left + toX(r.Vo)}
            cy={pad.top + toY(r.epsilon)}
            r={4} fill="#f97316" />
        ))}
        <SvgText x={pad.left + iW / 2} y={H - 4}
          fontSize={11} textAnchor="middle" fill="#374151">
          Vo (m/s)
        </SvgText>
        <SvgText x={13} y={pad.top + iH / 2}
          fontSize={11} textAnchor="middle" fill="#374151"
          transform={`rotate(-90, 13, ${pad.top + iH / 2})`}>
          ε
        </SvgText>
      </Svg>
    </View>
  );
})()}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 16,
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

  label: {
    fontSize: 14,
    marginBottom: 6,
    color: "#374151",
  },

  inputGroup: {
    marginBottom: 16,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: "#F9FAFB",
    marginBottom: 10,
  },

  unitPicker: {
    width: 100,
    height: 50,
  },

  runCard: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },

  runTitle: {
    fontWeight: "600",
    marginBottom: 8,
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
    borderWidth: 1,
    borderColor: "#6B7280",
    borderRadius: 8,
    backgroundColor: "#6B7280",
    justifyContent: "center",
    alignItems: "center",
  },

  summaryBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 14,
    minHeight: 140,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
  },

  summaryText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
});
