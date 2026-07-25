import { doc, setDoc,getDoc} from "firebase/firestore";
import { db } from "../firebase/config";

export async function uploadExperiment(subjectId: string, experiment: any) {
  const experimentRef = doc(
    db,
    "subjects",
    subjectId,
    "experiments",
    experiment.id,
  );

  await setDoc(experimentRef, experiment);
}


export async function getExperiments(subjectId: string) {
}

export async function getExperiment(
  subjectId: string,
  experimentId: string
) {
  const ref = doc(db, "subjects", subjectId, "experiments", experimentId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}
