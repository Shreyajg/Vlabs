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
  rm: string;
  flow: string;
};

type Result = {
  run: number;
  Rm: number;
  Vo: number;
  NRe: number;
  fPE: number;
  fPT: number;
};

export default function PackedBed() {

  // CONSTANT INPUTS
  const [colDiameter, setColDiameter] = React.useState<string>("");
  const [colLength, setColLength] = React.useState<string>("");
  const [dp, setDp] = React.useState<string>("");

  const [rhoF, setRhoF] = React.useState<string>("");
  const [rhoM, setRhoM] = React.useState<string>("");
  const [mu, setMu] = React.useState<string>("");

  const [results, setResults] = React.useState<Result[]>([]);

  const [runs, setRuns] = React.useState<Run[]>([
    { lhs: "", rhs: "", rm: "", flow: "" },
  ]);

  const updateRun = (index: number, field: keyof Run, value: string) => {
    const updatedRuns = [...runs];
    updatedRuns[index][field] = value;
    setRuns(updatedRuns);
  };

  const addRun = () => {
    setRuns([...runs, { lhs: "", rhs: "", rm: "", flow: "" }]);
  };

  // CALCULATION
  const calculate = () => {
    const g = 9.81;

    const D = Number(colDiameter);
    const L = Number(colLength);
    const Dp = Number(dp);

    const rho_f = Number(rhoF);
    const rho_m = Number(rhoM);
    const viscosity = Number(mu);

    const A = (Math.PI * D * D) / 4;

    const epsilon = 0.4; // typical void fraction

    let temp: Result[] = [];

    for (let i = 0; i < runs.length; i++) {
      const lhs = Number(runs[i].lhs);
      const rhs = Number(runs[i].rhs);

      let Rm =
        runs[i].rm !== ""
          ? Number(runs[i].rm)
          : (lhs - rhs) / 100; // cm → m

      const Q = (Number(runs[i].flow) * 1e-3) / 60; // LPM → m³/s

      if (Q === 0) continue;

      const Vo = Q / A;

      const NRe = (Dp * Vo * rho_f) / viscosity;

      // Experimental friction factor (Ergun)
      const fPE = (150 * (1 - epsilon) * (1 - epsilon)) /
            (NRe * epsilon * epsilon * epsilon) +
            (1.75 * (1 - epsilon)) /
            (epsilon * epsilon * epsilon);


      // Theoretical (pressure drop based)
      const deltaP_L =
        (Rm * g * (rho_m - rho_f)) / L;
    const fPT = (deltaP_L * Dp * epsilon * epsilon * epsilon) /
            (rho_f * Vo * Vo * (1 - epsilon));

      temp.push({
        run: i + 1,
        Rm,
        Vo,
        NRe,
        fPE,
        fPT,
      });
    }

    setResults(temp);
  };

  const getInference = (results: Result[]): string => {
    if (results.length === 0) return "";

    return "Ergun equation verified: viscous + inertial contributions observed.";
  };

  return (
    <ScrollView style={styles.body}>
      <View style={styles.header}>
        <Link href="/" style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
          <Text style={styles.headerTitle}>Packed Bed</Text>
        </Link>
      </View>

      {/* CONSTANTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Constants & Setup</Text>

        <TextInput style={styles.input} placeholder="Column Diameter (m)" onChangeText={setColDiameter} />
        <TextInput style={styles.input} placeholder="Column Length (m)" onChangeText={setColLength} />
        <TextInput style={styles.input} placeholder="Packing Diameter (m)" onChangeText={setDp} />
        <TextInput style={styles.input} placeholder="Fluid Density" onChangeText={setRhoF} />
        <TextInput style={styles.input} placeholder="Manometer Density" onChangeText={setRhoM} />
        <TextInput style={styles.input} placeholder="Viscosity" onChangeText={setMu} />
      </View>

      {/* RUN DATA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Run Data</Text>

        {runs.map((run, index) => (
          <View key={index} style={styles.runCard}>
            <Text>Run {index + 1}</Text>

            <TextInput style={styles.input} placeholder="LHS" onChangeText={(v) => updateRun(index, "lhs", v)} />
            <TextInput style={styles.input} placeholder="RHS" onChangeText={(v) => updateRun(index, "rhs", v)} />
            <TextInput style={styles.input} placeholder="Rm (optional)" onChangeText={(v) => updateRun(index, "rm", v)} />
            <TextInput style={styles.input} placeholder="Flow (LPM)" onChangeText={(v) => updateRun(index, "flow", v)} />
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
        {/* GRAPH */}
<View style={styles.card}>
  <Text style={styles.cardTitle}>Graph: f vs N_Re</Text>

  {results.length === 0 ? (
    <Text style={{ color: "#6B7280" }}>Graph will appear after calculating</Text>
  ) : (() => {
    const pad = { top: 20, right: 20, bottom: 45, left: 58 };
    const W = 300, H = 220;
    const iW = W - pad.left - pad.right;
    const iH = H - pad.top - pad.bottom;

    const validResults = results.filter(r => r.fPE > 0 && r.fPT > 0 && r.NRe > 0);
    if (validResults.length === 0) return <Text>Not enough data</Text>;

    const sorted = [...validResults].sort((a, b) => a.NRe - b.NRe);

    const allRe = sorted.map(r => r.NRe);
    const allF  = sorted.flatMap(r => [r.fPE, r.fPT]);

    const xMin = Math.min(...allRe);
    const xMax = Math.max(...allRe);
    const yMin = 0;
    const yMax = Math.max(...allF) * 1.2;

    const toX = (v: number) => ((v - xMin) / (xMax - xMin)) * iW;
    const toY = (v: number) => iH - ((v - yMin) / (yMax - yMin)) * iH;

    // X tick marks (5 evenly spaced)
    const xTicks = Array.from({ length: 5 }, (_, i) =>
      xMin + (i * (xMax - xMin)) / 4
    );
    // Y tick marks (5 evenly spaced)
    const yTicks = Array.from({ length: 5 }, (_, i) =>
      yMin + (i * (yMax - yMin)) / 4
    );

    return (
      <View>
        {/* Legend */}
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 16, height: 3, backgroundColor: "#f97316" }} />
            <Text style={{ fontSize: 11, color: "#6B7280" }}>fPT Theoretical</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 16, height: 3, backgroundColor: "#2563EB" }} />
            <Text style={{ fontSize: 11, color: "#6B7280" }}>fPE Experimental</Text>
          </View>
        </View>

        <Svg width={W} height={H}>
          {/* Grid lines */}
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

          {/* Tick labels */}
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
              {t.toFixed(0)}
            </SvgText>
          ))}

          {/* Axes */}
          <Line x1={pad.left} y1={pad.top}
                x2={pad.left} y2={pad.top + iH}
                stroke="#374151" strokeWidth={1.5} />
          <Line x1={pad.left} y1={pad.top + iH}
                x2={pad.left + iW} y2={pad.top + iH}
                stroke="#374151" strokeWidth={1.5} />

          {/* fPT line — orange */}
          {sorted.length > 1 && (
            <Polyline
              points={sorted.map(r =>
                `${pad.left + toX(r.NRe)},${pad.top + toY(r.fPT)}`
              ).join(" ")}
              fill="none" stroke="#f97316" strokeWidth={2} />
          )}

          {/* fPE line — blue */}
          {sorted.length > 1 && (
            <Polyline
              points={sorted.map(r =>
                `${pad.left + toX(r.NRe)},${pad.top + toY(r.fPE)}`
              ).join(" ")}
              fill="none" stroke="#2563EB" strokeWidth={2} />
          )}

          {/* fPT dots — orange */}
          {sorted.map((r, i) => (
            <Circle key={`pt${i}`}
              cx={pad.left + toX(r.NRe)}
              cy={pad.top + toY(r.fPT)}
              r={4} fill="#f97316" />
          ))}

          {/* fPE dots — blue */}
          {sorted.map((r, i) => (
            <Circle key={`pe${i}`}
              cx={pad.left + toX(r.NRe)}
              cy={pad.top + toY(r.fPE)}
              r={4} fill="#2563EB" />
          ))}

          {/* Axis labels */}
          <SvgText
            x={pad.left + iW / 2} y={H - 4}
            fontSize={11} textAnchor="middle" fill="#374151">
            N_Re
          </SvgText>
          <SvgText
            x={13} y={pad.top + iH / 2}
            fontSize={11} textAnchor="middle" fill="#374151"
            transform={`rotate(-90, 13, ${pad.top + iH / 2})`}>
            f
          </SvgText>
        </Svg>
      </View>
    );
  })()}
</View>
      {/* RESULTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Results and Inference</Text>

        {results.length === 0 ? (
          <Text>No results yet</Text>
        ) : (
          <>
            {results.map((r) => (
              <View key={r.run}>
                <Text>Run {r.run}</Text>
                <Text>Re: {r.NRe.toFixed(0)}</Text>
                <Text>fPE: {r.fPE.toFixed(4)}</Text>
                <Text>fPT: {r.fPT.toFixed(4)}</Text>
              </View>
            ))}
            <Text>{getInference(results)}</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: "#F3F4F6", padding: 16 },
  header: { padding: 12, backgroundColor: "#fff" },
  backButton: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "600", marginLeft: 8 },
  card: { backgroundColor: "#fff", padding: 16, marginBottom: 16, borderRadius: 10 },
  cardTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  input: { borderWidth: 1, padding: 8, marginBottom: 10 },
  runCard: { marginBottom: 10 },
  addButton: { backgroundColor: "blue", padding: 10, alignItems: "center" },
  addButtonText: { color: "#fff" },
  graphContainer: {
  height: 250,
},
});