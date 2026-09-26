import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import type { NormalizedExperiment, RawExperimentData } from "../types/Experiment";
import { normalizeExperiment } from "./normalizeExperiment";
import { ServiceError } from "./serviceError";

// Firestore is the source of truth: subjects/{subjectId}/experiments/{experimentId}.
// Documents are normalized on read and are never rewritten to fit the normalized shape.

function toNormalized(
  subjectId: string,
  id: string,
  data: RawExperimentData,
): NormalizedExperiment {
  const experiment = normalizeExperiment({ id, subjectId, data });

  if (__DEV__ && experiment.warnings.length > 0) {
    console.warn(
      `[experiments] ${subjectId}/${id} has data quality notes:\n - ${experiment.warnings.join("\n - ")}`,
    );
  }

  return experiment;
}

/** Writes a document as-is. Used by the seed script; performs a full overwrite. */
export async function uploadExperiment(
  subjectId: string,
  experiment: RawExperimentData & { id: string },
): Promise<void> {
  const experimentRef = doc(
    db,
    "subjects",
    subjectId,
    "experiments",
    experiment.id,
  );

  await setDoc(experimentRef, experiment);
}

/**
 * The published experiments of a subject. The filter is required, not cosmetic: Firestore rules
 * only let a student read published experiments, and a list query must state that itself.
 * @throws ServiceError when Firestore rejects the request (permission-denied, unavailable, ...).
 */
export async function getExperiments(subjectId: string): Promise<NormalizedExperiment[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "subjects", subjectId, "experiments"),
        where("isPublished", "==", true),
      ),
    );

    return snapshot.docs.map((document) =>
      toNormalized(subjectId, document.id, document.data()),
    );
  } catch (error) {
    throw new ServiceError(`load experiments for subject "${subjectId}"`, error);
  }
}

/**
 * Every experiment of a subject, published or not — faculty-only in practice: the rule already grants
 * faculty unconditional read on subjects/{s}/experiments/{e}, but a student's own read is still gated to
 * `isPublished == true` per document, so this query returns permission-denied for a student the moment it
 * would otherwise include a draft. Used for faculty-facing counts (Dashboard/Reports "Experiments"),
 * where the true total including drafts is the useful number; getExperiments() (published-only) remains
 * what students, and the student-facing Subject screen, use.
 * @throws ServiceError when Firestore rejects the request.
 */
export async function getAllExperiments(subjectId: string): Promise<NormalizedExperiment[]> {
  try {
    const snapshot = await getDocs(collection(db, "subjects", subjectId, "experiments"));

    return snapshot.docs.map((document) => toNormalized(subjectId, document.id, document.data()));
  } catch (error) {
    throw new ServiceError(`load all experiments for subject "${subjectId}"`, error);
  }
}

/**
 * Publishes or unpublishes one experiment: a targeted update of just isPublished, not the full-document
 * overwrite uploadExperiment() does. Firestore rules already gate this to faculty and require the final
 * isPublished to be a boolean, so no rules change is needed for this call.
 * @throws ServiceError when Firestore rejects the write (for example a non-faculty caller).
 */
export async function setExperimentPublished(
  subjectId: string,
  experimentId: string,
  isPublished: boolean,
): Promise<void> {
  try {
    await updateDoc(doc(db, "subjects", subjectId, "experiments", experimentId), { isPublished });
  } catch (error) {
    throw new ServiceError(
      `${isPublished ? "publish" : "unpublish"} experiment "${subjectId}/${experimentId}"`,
      error,
    );
  }
}

/**
 * Creates a new experiment document, faculty-authored. Refuses to overwrite an existing document at the
 * same id (a real error, not a silent replace) — callers should surface this as "choose a different
 * title" rather than retry. Always created as a draft: publishing is a separate, explicit step through
 * setExperimentPublished(), never implied by create.
 * @throws ServiceError when the id is already taken or Firestore rejects the write.
 */
export async function createExperiment(
  subjectId: string,
  experimentId: string,
  data: RawExperimentData,
  createdBy: string,
): Promise<void> {
  const ref = doc(db, "subjects", subjectId, "experiments", experimentId);

  try {
    const existing = await getDoc(ref);

    if (existing.exists()) {
      throw new ServiceError(
        `create experiment "${subjectId}/${experimentId}"`,
        new Error("An experiment with this id already exists. Choose a different title."),
      );
    }

    await setDoc(ref, {
      ...data,
      id: experimentId,
      subjectId,
      isPublished: false,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof ServiceError) throw error;

    throw new ServiceError(`create experiment "${subjectId}/${experimentId}"`, error);
  }
}

/**
 * Updates an existing experiment's content. A targeted updateDoc, not uploadExperiment()'s full
 * overwrite: any real field `data` does not mention (isPublished, createdBy, createdAt, id, subjectId,
 * route) is left exactly as it is in Firestore. Never touches isPublished — publishing stays
 * setExperimentPublished()'s job alone.
 * @throws ServiceError when Firestore rejects the write.
 */
export async function updateExperiment(
  subjectId: string,
  experimentId: string,
  data: RawExperimentData,
): Promise<void> {
  try {
    await updateDoc(doc(db, "subjects", subjectId, "experiments", experimentId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new ServiceError(`update experiment "${subjectId}/${experimentId}"`, error);
  }
}

/**
 * @returns the normalized experiment, or null when the document does not exist.
 * @throws ServiceError when Firestore rejects the request.
 */
export async function getExperiment(
  subjectId: string,
  experimentId: string,
): Promise<NormalizedExperiment | null> {
  try {
    const snapshot = await getDoc(
      doc(db, "subjects", subjectId, "experiments", experimentId),
    );

    if (!snapshot.exists()) return null;

    return toNormalized(subjectId, snapshot.id, snapshot.data());
  } catch (error) {
    throw new ServiceError(`load experiment "${subjectId}/${experimentId}"`, error);
  }
}
