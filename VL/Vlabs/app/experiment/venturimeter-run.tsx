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

export default function VenturiRun() {
    const [runs, setRuns] = React.useState([
        { lhs: "", rhs: "", height: "", time: "" },
    ]);
    const addRun = () => {
        setRuns([...runs, { lhs: "", rhs: "", height: "", time: "" }]);
    };
    const updateRun = (
        index: number,
        field: "lhs" | "rhs" | "height" | "time",
        value: string,
    ) => {
        const updatedRuns = [...runs];
        updatedRuns[index][field] = value;
        setRuns(updatedRuns);
    };
    const [pipeUnit, setPipeUnit] = React.useState("mm");
    const [throatUnit, setThroatUnit] = React.useState("mm");
    const [areaUnit, setAreaUnit] = React.useState("m2");
    const [densityUnit, setDensityUnit] = React.useState("kg/m3");
    const [viscosityUnit, setViscosityUnit] = React.useState("kg/ms");
    return (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 60 }}>
            <View style={styles.header}>
                <Link href="/" style={styles.backButton}>
                    <Ionicons name="chevron-back" size={22} color="#111827" />
                    <Text style={styles.headerTitle}>Venturi Meter</Text>
                </Link>
            </View>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Constants & Setup</Text>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Pipe Diameter</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={styles.input} placeholder="Enter diameter" keyboardType="numeric" />
                        <Picker selectedValue={pipeUnit} style={styles.unitPicker} onValueChange={(itemValue) => setPipeUnit(itemValue)}>
                            <Picker.Item label="m" value="m" />
                            <Picker.Item label="cm" value="cm" />
                            <Picker.Item label="mm" value="mm" />
                        </Picker>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Throat Diameter</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={styles.input} placeholder="Enter throat diameter" keyboardType="numeric" />
                        <Picker selectedValue={throatUnit} style={styles.unitPicker} onValueChange={(itemValue) => setThroatUnit(itemValue)}>
                            <Picker.Item label="m" value="m" />
                            <Picker.Item label="cm" value="cm" />
                            <Picker.Item label="mm" value="mm" />
                        </Picker>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Collection Tank Area</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={styles.input} placeholder="Enter area" keyboardType="numeric" />
                        <Picker selectedValue={areaUnit} style={styles.unitPicker} onValueChange={(itemValue) => setAreaUnit(itemValue)}>
                            <Picker.Item label="m²" value="m2" />
                            <Picker.Item label="cm²" value="cm2" />
                        </Picker>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Manometer Fluid Density</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={styles.input} placeholder="Enter density" keyboardType="numeric" />
                        <Picker selectedValue={densityUnit} style={styles.unitPicker} onValueChange={(itemValue) => setDensityUnit(itemValue)}>
                            <Picker.Item label="kg/m³" value="kg/m3" />
                            <Picker.Item label="g/cm³" value="g/cm3" />
                        </Picker>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Flowing Fluid Density</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={styles.input} placeholder="Enter density" keyboardType="numeric" />
                        <Picker selectedValue={densityUnit} style={styles.unitPicker} onValueChange={(itemValue) => setDensityUnit(itemValue)}>
                            <Picker.Item label="kg/m³" value="kg/m3" />
                            <Picker.Item label="g/cm³" value="g/cm3" />
                        </Picker>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Viscosity</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={styles.input} placeholder="Enter viscosity" keyboardType="numeric" />
                        <Picker selectedValue={viscosityUnit} style={styles.unitPicker} onValueChange={(itemValue) => setViscosityUnit(itemValue)}>
                            <Picker.Item label="kg/m·s" value="kg/ms" />
                            <Picker.Item label="Pa·s" value="pas" />
                        </Picker>
                    </View>
                </View>
            </View>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Run Data</Text>
                {runs.map((run, index) => (
                    <View key={index} style={styles.runCard}>
                        <Text style={styles.runTitle}>Run {index + 1}</Text>
                        <Text>LHS (mm)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" onChangeText={(v) => updateRun(index, "lhs", v)} />
                        <Text>RHS (mm)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" onChangeText={(v) => updateRun(index, "rhs", v)} />
                        <Text>Water Height (m)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" onChangeText={(v) => updateRun(index, "height", v)} />
                        <Text>Time (s)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" onChangeText={(v) => updateRun(index, "time", v)} />
                    </View>
                ))}
                <TouchableOpacity style={styles.addButton} onPress={addRun}>
                    <Text style={styles.addButtonText}>Add Data</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Graphs</Text>

                <Text>Qact vs Rm</Text>
                <View style={styles.graphContainer}>
                    <Text>Graph will appear here</Text>
                </View>

                <Text style={{ marginTop: 12 }}>Cd vs NRe</Text>
                <View style={styles.graphContainer}>
                    <Text>Graph will appear here</Text>
                </View>
            </View>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Results & Inference</Text>
                <View style={styles.summaryBox}>
                    <Text style={styles.summaryText}>
                        Results will appear here after calculation
                    </Text>
                </View>
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
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        marginBottom: 6,
        color: "#374151",
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