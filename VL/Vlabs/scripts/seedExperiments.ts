import { experiments } from "../constants/experiments.ts";
import { uploadExperiment } from "../services/experimentService.ts";

export async function seedExperiments() {
  try {
    console.log("Starting upload...");

    for (const experiment of experiments) {
      await uploadExperiment("fluid-mechanics", {
        ...experiment,

        subjectId: "fluid-mechanics",

        createdAt: new Date(),

        updatedAt: new Date(),
      });

      console.log(`Uploaded: ${experiment.title}`);
    }

    console.log("All experiments uploaded successfully!");
  } catch (error) {
    console.error("Upload failed:", error);
  }
}

seedExperiments()
  .then(() => process.exit(0))
  .catch(console.error);