import { experiments } from "../constants/experiments";
import { uploadExperiment } from "../services/experimentService";

export async function seedExperiments() {
  try {
    console.log("Starting upload...");

    for (const experiment of experiments) {
      await uploadExperiment("fluid-mechanics", {
        ...experiment,

        subjectId: "fluid-mechanics",

        createdBy: "admin",

        createdAt: new Date(),

        updatedAt: new Date(),

        isPublished: true,

        constants: experiment.constants ?? [],

        inputFields: experiment.inputFields ?? [],

        formulas: experiment.formulas ?? [],

        graphConfigs: experiment.graphConfigs ?? [],
      });

      console.log(`Uploaded: ${experiment.title}`);
    }

    console.log("All experiments uploaded successfully!");
  } catch (error) {
    console.error("Upload failed:", error);
  }
}

// Uncomment only when seeding
// seedExperiments()
//   .then(() => process.exit(0))
//   .catch(console.error);
