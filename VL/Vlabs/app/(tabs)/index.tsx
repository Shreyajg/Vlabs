import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import React from "react";
import { StyleSheet, Text, View, Image } from "react-native";
import { experiments } from "../../constants/experiments";

export default function Home() {
  return (
    <View style={styles.body}>

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Fluid Dynamics</Text>
          <Text style={styles.subtitle}>Laboratory Manual</Text>
        </View>

        <Image
          source={require("../../assets/images/lab.avif")}
          style={styles.headerImage}
          resizeMode="contain"
        />
      </View>

      {/* SECTION TITLE */}
      <View style={styles.list}>
        <Text style={styles.sectionTitle}>Experiments</Text>
        <Text style={styles.sectionSubtitle}>
          Select an experiment to begin
        </Text>
      </View>

      {/* EXPERIMENT LIST */}
      {experiments.map((exp, index) => (
        <View key={exp.id} style={styles.experimentCard}>
          <Link
            href={{
              pathname: "/experiment/[id]",
              params: { id: exp.id },
            }}
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>
              {index + 1}. {exp.title}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </Link>
        </View>
      ))}

    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: "#f3f4f6",
    flex: 1,
    paddingVertical: 30,
    paddingHorizontal: 20,
  },

  /* HEADER */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#111827",
  },

  subtitle: {
    fontSize: 16,
    color: "#2563EB",
    marginTop: 4,
  },

  headerImage: {
    width: 80,
    height: 80,
    marginLeft: 10,
  },

  /* SECTION */
  list: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },

  sectionSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },

  /* CARD */
  experimentCard: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    elevation: 2,
  },

  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  linkText: {
    fontSize: 16,
    color: "#111827",
  },
});