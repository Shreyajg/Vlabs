import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Link,useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { experiments } from "../../constants/experiments";

export default function Experiment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const experiment = experiments.find((exp) => exp.id === id);
  if(!experiment){
    return (
      <View style={styles.body}>
        <View style={styles.header}>
          <Link href="/" style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
            <Text style={styles.headerTitle}>Experiment Not Found</Text>
          </Link>
        </View>
      </View>
    );
  }
  return (
    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Link href="/" style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
          <Text style={styles.headerTitle}>{experiment?.title}</Text>
        </Link>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Aim</Text>
        {Array.isArray(experiment.aim)? experiment.aim.map((item, index) => (<Text key={index} style={styles.cardText}>{item}</Text>)): (<Text style={styles.cardText}>{experiment.aim}</Text>)}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Theory</Text>
        <Text style={styles.cardText}>{experiment?.theory}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Procedure</Text>
        {experiment.procedure.map((step, index) => (<Text key={index} style={styles.cardText}>{index + 1}. {step}</Text>))}
      </View>
      <Link href={`/experiment/${experiment.id}-run`} asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Start Experiment</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: "#f3f4f6",
    flex: 1,
    paddingVertical: 30,
    padding: 20,
  },
  header: {
    marginBottom: 20,
    paddingVertical: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  card: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: "#374151",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    height: 40,
    borderColor: "#D1D5DB",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  unitPicker: {
    width: 80,
    height: 40,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
  },
  runCard: {
    marginBottom: 12,
  },
  runTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  equationCard: {
    backgroundColor: "#f3f4f6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  equationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  equationText: {
    fontSize: 14,
    color: "#374151",
    fontFamily: "monospace",
  },
  resultCard: {
    backgroundColor: "#f3f4f6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: "#374151",
  },
  button: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});