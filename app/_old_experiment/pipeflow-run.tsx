import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Link } from "expo-router";
import React from "react";
import { getExperiment } from "@/services/experimentService";
import Svg, { Line, Circle, Polyline, Text as SvgText } from "react-native-svg";
import { evaluate } from "mathjs";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { VictoryChart, VictoryLine, VictoryAxis } from "victory-native";
import { useLocalSearchParams } from "expo-router";
// TYPES
type Run = {
  lhs: string;
  rhs: string;
  height: string;
  time: string;
};

type Result = {
  run: number;
  [key: string]: number;
};

export default function PipeFlow() {
  const [experiment, setExperiment] = React.useState<any>(null);

  // INPUT STATES
  const [inputs, setInputs] = React.useState<Record<string, string>>({});

  // UNIT STATES
  const [units, setUnits] = React.useState<Record<string, string>>({});

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
  const { id } = useLocalSearchParams();
  React.useEffect(() => {
      async function loadExperiment() {
        if (!id || Array.isArray(id)) return;
        const data = await getExperiment("fluid-mechanics",id);
        setExperiment(data);
      }

      loadExperiment();
    }, [id]);
    
  if (!experiment) {
  return <Text>Loading...</Text>;
}
console.log("EXPERIMENT:", experiment);
console.log("INPUTS:", experiment.inputFields);
console.log("RUN INPUTS:", experiment.runInputs);
console.log("OUTPUTS:", experiment.outputs);
console.log("GRAPH:", experiment.graph);

  //Unit conversion
  const convertToSI = (
    value: number,
    unit: string
  ): number => {
    const conversions: Record<string, number> = {
      m: 1,
      cm: 0.01,
      mm: 0.001,
      inch: 0.0254,
      ft: 0.3048,

      "m²": 1,
      "cm²": 0.0001,
      "ft²": 0.092903,

      "kg/m³": 1,
      "g/cm³": 1000,

      "Pa·s": 1,
      cP: 0.001,
    };

    return value * (conversions[unit] ?? 1);
  };
  // CALCULATION
  const calculate = () => {
  try {
    if (!experiment) return;

    console.log("EXPERIMENT:", experiment);
    console.log("inputs:", experiment.inputs);
    console.log("runInputs:", experiment.runInputs);
    console.log("constants:", experiment.constants);
    console.log("formulas:", experiment.formulas);
    console.log("outputs:", experiment.outputs);

    const calculatedResults: Result[] = [];

    for (let i = 0; i < runs.length; i++) {
      const scope: Record<string, number> = {};

      console.log("STEP 1 - inputs");

      for (const input of experiment.inputFields ?? []) {
        const value = Number(inputs[input.key]);
        const unit = units[input.key] || input.defaultUnit;

        scope[input.key] = convertToSI(value, unit);
      }

      console.log("STEP 2 - run inputs");

      for (const runInput of experiment.runInputs ?? []) {
        scope[runInput.key] = Number(
          runs[i][runInput.key as keyof Run]
        );
      }

      console.log("STEP 3 - constants");

      if (experiment.constants) {
        for (const constant of experiment.constants ?? []) {
          scope[constant.key] = Number(constant.value);
        }
      }

      console.log("STEP 4 - formulas", scope);

      for (const formula of experiment.formulas ?? []) {
        console.log("EVALUATING:", formula);

        const value = evaluate(formula.expression, scope);

        scope[formula.key] = Number(value);
      }

      console.log("STEP 5 - outputs");

      const result: Result = {
        run: i + 1,
      };

      for (const output of experiment.outputs ?? []) {
        result[output.key] = scope[output.key];
      }

      calculatedResults.push(result);
    }

    setResults(calculatedResults);

  } catch (error) {
    console.error("CALCULATE ERROR:", error);
  }
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
          <Text style={styles.headerTitle}>{experiment.title}</Text>
        </Link>
      </View>

      {/* INPUTS */}
      <View style={styles.card}>
      <Text style={styles.cardTitle}>Constants</Text>

      {experiment.inputFields.map((input: any) => (
        <View key={input.key} style={{ marginBottom: 12 }}>
          <TextInput
            style={styles.input}
            placeholder={input.label}
            value={inputs[input.key] || ""}
            onChangeText={(value) =>
              setInputs((prev) => ({
                ...prev,
                [input.key]: value,
              }))
            }
          />

          <Picker
            selectedValue={units[input.key] || input.units[0]}
            onValueChange={(value) =>
              setUnits((prev) => ({
                ...prev,
                [input.key]: value,
              }))
            }
          >
            {input.units.map((unit: string) => (
              <Picker.Item
                key={unit}
                label={unit}
                value={unit}
              />
            ))}
          </Picker>
        </View>
      ))}
    </View>

      {/* RUN DATA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Run Data</Text>

        {runs.map((run, i) => (
        <View key={i}>
          {experiment.runInputs.map((field: any) => (
            <TextInput
              key={field.key}
              style={styles.input}
              placeholder={field.label}
              value={run[field.key as keyof Run]}
              onChangeText={(value) =>
                updateRun(i, field.key as keyof Run, value)
              }
            />
          ))}
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
  const logMin = (arr: number[]) => Math.log10(Math.min(...arr));
  const logMax = (arr: number[]) => Math.log10(Math.max(...arr));

  const xKey = experiment.graph.xKey as keyof Result;
  const yKey = experiment.graph.yKey as keyof Result;

  const xValues = results.map(r => Number(r[xKey]));
  const yValues = results.map(r => Number(r[yKey]));

  const xMin = logMin(xValues) - 0.2;
  const xMax = logMax(xValues) + 0.2;
  const yMin = logMin(yValues) - 0.2;
  const yMax = logMax(yValues) + 0.2;

  const toX = (val: number) => ((Math.log10(val) - xMin) / (xMax - xMin)) * innerW;
  const toY = (val: number) => innerH - ((Math.log10(val) - yMin) / (yMax - yMin)) * innerH;

  // Sort by NRe for line
  const sorted = [...results].sort(
    (a, b) => Number(a[xKey]) - Number(b[xKey])
  );
  const points = sorted.map(r => `${toX(Number(r[xKey]))},${toY(Number(r[yKey]))}`).join(" ");

  // Tick labels
  const reRange = Math.ceil(xMax) - Math.floor(xMin);
  const xTicks = Array.from({ length: reRange + 1 }, (_, i) => Math.floor(xMin) + i);
  const fRange = Math.ceil(yMax) - Math.floor(yMin);
  const yTicks = Array.from({ length: fRange + 1 }, (_, i) => Math.floor(yMin) + i);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        Graph: {experiment.graph.title}
        {experiment.graph.scale === "log" ? " (Log–Log)" : ""}
      </Text>
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
            points={sorted
              .map(
                r =>
                  `${padding.left + toX(Number(r[xKey]))},${
                    padding.top + toY(Number(r[yKey]))
                  }`
              )
              .join(" ")}
            fill="none"
            stroke="#2563EB"
            strokeWidth={1.5}
          />
        )}

        {/* Data points */}
        {results.map((r, i) => (
          <Circle
            key={i}
            cx={padding.left + toX(Number(r[xKey]))}
            cy={padding.top + toY(Number(r[yKey]))}
            r={4}
            fill="#2563EB"
          />
        ))}

        {/* Axis labels */}
        <SvgText x={padding.left + innerW / 2} y={H - 2} fontSize={11} textAnchor="middle" fill="#374151">
          {experiment.graph.xLabel}
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
  {experiment.graph.yLabel}
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

          {experiment.outputs.map((output: any) => (
            <Text key={output.key}>
              {output.label}:{" "}
              {Number(r[output.key as keyof Result]).toFixed(output.decimals)}
            </Text>
          ))}
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