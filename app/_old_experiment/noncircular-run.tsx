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
  height: string;
  time: string;
};

type Result = {
  run: number;
  Rm: number;
  deltaP: number;
  Q: number;
  V: number;
  NRe: number;
  f: number;
};

export default function NonCircularRun() {

  // INPUT STATES
  const [width, setWidth] = React.useState("");
  const [breadth, setBreadth] = React.useState("");
  const [length, setLength] = React.useState("");
  const [area, setArea] = React.useState("");
  const [density, setDensity] = React.useState("");
  const [viscosity, setViscosity] = React.useState("");

  const [results, setResults] = React.useState<Result[]>([]);

  const [runs, setRuns] = React.useState<Run[]>([
    { lhs: "", rhs: "", height: "", time: "" },
  ]);

  const addRun = () => {
    setRuns([...runs, { lhs: "", rhs: "", height: "", time: "" }]);
  };

  const updateRun = (
    index: number,
    field: keyof Run,
    value: string,
  ) => {
    const updatedRuns = [...runs];
    updatedRuns[index][field] = value;
    setRuns(updatedRuns);
  };

  const [pipeType, setPipeType] = React.useState("square");
  const [lengthUnit, setLengthUnit] = React.useState("m");
  const [areaUnit, setAreaUnit] = React.useState("m2");
  const [densityUnit, setDensityUnit] = React.useState("kg/m3");
  const [viscosityUnit, setViscosityUnit] = React.useState("kg/ms");

  // CONVERSIONS
  const toMeters = (unit: string, val: number) => {
    if (unit === "cm") return val / 100;
    if (unit === "mm") return val / 1000;
    return val;
  };

  const toArea = (unit: string, val: number) => {
    if (unit === "cm2") return val / 10000;
    if (unit === "mm2") return val / 1000000;
    return val;
  };

  // CALCULATE
  const calculate = () => {
    const g = 9.81;
    const rho_m = 13600;

    let L = toMeters(lengthUnit, Number(length));
    let A_tank = toArea(areaUnit, Number(area));
    let rho_f = Number(density);
    let mu = Number(viscosity);

    if (densityUnit === "g/cm3") rho_f *= 1000;
    if (viscosityUnit === "pas") mu = mu;

    const w = Number(width);
    const b = pipeType === "square" ? w : Number(breadth);

    // Equivalent diameter
    let De =
      pipeType === "square"
        ? w
        : (2 * w * b) / (w + b);

    let temp: Result[] = [];

    for (let i = 0; i < runs.length; i++) {
      const lhs = Number(runs[i].lhs);
      const rhs = Number(runs[i].rhs);
      const h = Number(runs[i].height);
      const t = Number(runs[i].time);

      if (t === 0) continue;

      const Rm = (lhs - rhs) / 1000; // mm → m

      const deltaP = Rm * (rho_m - rho_f) * g;

      const Q = (A_tank * h) / t;

      const A_pipe = (Math.PI * De * De) / 4;

      const V = Q / A_pipe;

      const NRe = (De * V * rho_f) / mu;

      let f = 0;
      if (V !== 0) {
        f = (deltaP * De) / (2 * rho_f * L * V * V);
      }

      temp.push({
        run: i + 1,
        Rm,
        deltaP,
        Q,
        V,
        NRe,
        f,
      });
    }

    setResults(temp);
  };

  const getInference = (results: Result[]): string => {
    if (results.length === 0) return "";

    const avgRe =
      results.reduce((sum, r) => sum + r.NRe, 0) /
      results.length;

    if (avgRe < 2100)
      return "Laminar flow (f = 16/Re)";
    if (avgRe > 4000)
      return "Turbulent flow (Blasius equation)";
    return "Transitional flow";
  };

  return (
    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={styles.header}>
        <Link href="/" style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
          <Text style={styles.headerTitle}>Non-Circular Pipe Flow</Text>
        </Link>
      </View>

      {/* CONSTANTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Constants & Setup</Text>

        <Text style={styles.label}>Pipe Type</Text>
        <Picker selectedValue={pipeType} onValueChange={setPipeType}>
          <Picker.Item label="Square" value="square" />
          <Picker.Item label="Rectangular" value="rectangular" />
        </Picker>

        <Text style={styles.label}>Width (w)</Text>
        <TextInput style={styles.input} onChangeText={setWidth} />

        {pipeType === "rectangular" && (
          <>
            <Text style={styles.label}>Breadth (b)</Text>
            <TextInput style={styles.input} onChangeText={setBreadth} />
          </>
        )}

        <Text style={styles.label}>Pipe Length</Text>
        <TextInput style={styles.input} onChangeText={setLength} />

        <Text style={styles.label}>Tank Area</Text>
        <TextInput style={styles.input} onChangeText={setArea} />

        <Text style={styles.label}>Density</Text>
        <TextInput style={styles.input} onChangeText={setDensity} />

        <Text style={styles.label}>Viscosity</Text>
        <TextInput style={styles.input} onChangeText={setViscosity} />
      </View>

      {/* RUN DATA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Run Data</Text>

        {runs.map((run, index) => (
          <View key={index} style={styles.runCard}>
            <Text>Run {index + 1}</Text>

            <TextInput placeholder="LHS" style={styles.input}
              onChangeText={(v) => updateRun(index, "lhs", v)} />

            <TextInput placeholder="RHS" style={styles.input}
              onChangeText={(v) => updateRun(index, "rhs", v)} />

            <TextInput placeholder="Height" style={styles.input}
              onChangeText={(v) => updateRun(index, "height", v)} />

            <TextInput placeholder="Time" style={styles.input}
              onChangeText={(v) => updateRun(index, "time", v)} />
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
        <Text style={styles.cardTitle}>Graph: f vs N_Re (Log–Log)</Text>

        {results.length === 0 ? (
            <Text style={{ color: "#6B7280" }}>Graph will appear after calculating</Text>
        ) : (() => {
            const pad = { top: 20, right: 20, bottom: 45, left: 58 };
            const W = 300, H = 220;
            const iW = W - pad.left - pad.right;
            const iH = H - pad.top - pad.bottom;

            const validResults = results.filter(r => r.f > 0 && r.NRe > 0);
            if (validResults.length === 0) return <Text>Not enough data</Text>;

            const reVals = validResults.map(r => r.NRe);
            const fVals  = validResults.map(r => r.f);

            const xMin = Math.log10(Math.min(...reVals)) - 0.2;
            const xMax = Math.log10(Math.max(...reVals)) + 0.2;
            const yMin = Math.log10(Math.min(...fVals))  - 0.2;
            const yMax = Math.log10(Math.max(...fVals))  + 0.2;

            const toX = (v: number) => ((Math.log10(v) - xMin) / (xMax - xMin)) * iW;
            const toY = (v: number) => iH - ((Math.log10(v) - yMin) / (yMax - yMin)) * iH;

            const sorted = [...validResults].sort((a, b) => a.NRe - b.NRe);

            const xTicks = Array.from(
            { length: Math.ceil(xMax) - Math.floor(xMin) + 1 },
            (_, i) => Math.floor(xMin) + i
            );
            const yTicks = Array.from(
            { length: Math.ceil(yMax) - Math.floor(yMin) + 1 },
            (_, i) => Math.floor(yMin) + i
            );

            return (
            <Svg width={W} height={H}>
                {/* Grid lines */}
                {yTicks.map(t => (
                <Line key={`gy${t}`}
                    x1={pad.left} y1={pad.top + toY(Math.pow(10, t))}
                    x2={pad.left + iW} y2={pad.top + toY(Math.pow(10, t))}
                    stroke="#E5E7EB" strokeWidth={1} />
                ))}
                {xTicks.map(t => (
                <Line key={`gx${t}`}
                    x1={pad.left + toX(Math.pow(10, t))} y1={pad.top}
                    x2={pad.left + toX(Math.pow(10, t))} y2={pad.top + iH}
                    stroke="#E5E7EB" strokeWidth={1} />
                ))}

                {/* Tick labels */}
                {yTicks.map(t => (
                <SvgText key={`ty${t}`}
                    x={pad.left - 5} y={pad.top + toY(Math.pow(10, t)) + 4}
                    fontSize={9} textAnchor="end" fill="#6B7280">
                    {`10^${t}`}
                </SvgText>
                ))}
                {xTicks.map(t => (
                <SvgText key={`tx${t}`}
                    x={pad.left + toX(Math.pow(10, t))} y={pad.top + iH + 14}
                    fontSize={9} textAnchor="middle" fill="#6B7280">
                    {`10^${t}`}
                </SvgText>
                ))}

                {/* Axes */}
                <Line x1={pad.left} y1={pad.top}
                    x2={pad.left} y2={pad.top + iH}
                    stroke="#374151" strokeWidth={1.5} />
                <Line x1={pad.left} y1={pad.top + iH}
                    x2={pad.left + iW} y2={pad.top + iH}
                    stroke="#374151" strokeWidth={1.5} />

                {/* Line connecting points */}
                {sorted.length > 1 && (
                <Polyline
                    points={sorted.map(r =>
                    `${pad.left + toX(r.NRe)},${pad.top + toY(r.f)}`
                    ).join(" ")}
                    fill="none" stroke="#2563EB" strokeWidth={1.5} />
                )}

                {/* Data points */}
                {validResults.map((r, i) => (
                <Circle key={i}
                    cx={pad.left + toX(r.NRe)}
                    cy={pad.top + toY(r.f)}
                    r={5} fill="#2563EB" />
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
            );
        })()}
        </View>

      {/* RESULTS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Results & Inference</Text>

        {results.length === 0 ? (
          <Text>No results yet</Text>
        ) : (
          <>
            {results.map((r) => (
              <View key={r.run}>
                <Text>Run {r.run}</Text>
                <Text>Re: {r.NRe.toFixed(0)}</Text>
                <Text>f: {r.f.toFixed(4)}</Text>
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
  alignItems: "flex-start",
  paddingVertical: 8,
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