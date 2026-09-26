import type { NormalizedExperiment } from "../types/Experiment";

// Pure module: no Firebase imports. Filters subjects and experiments the caller already loaded
// (getSubjects() once, getExperiments() per subject once) — calling this issues no Firestore read.

/** The minimal subject shape this module needs: whatever getSubjects() resolves, structurally. */
export interface SubjectLike {
  id: string;
  title?: string;
  description?: string;
}

/** One matching experiment, paired with its parent subject's display title for the "under a subject" caption. */
export interface ExperimentSearchMatch {
  experiment: NormalizedExperiment;
  subjectTitle: string;
}

export interface SubjectSearchResult {
  subjects: SubjectLike[];
  experiments: ExperimentSearchMatch[];
}

function matchesQuery(query: string, ...texts: readonly (string | undefined)[]): boolean {
  return texts.some((text) => text !== undefined && text.toLowerCase().includes(query));
}

/**
 * Searches subjects and experiments by title/description (an experiment's `aim` stands in for
 * "description": the calculation schema has no experiment description field, and aim is the same text
 * the Subject screen already shows as an experiment's caption).
 *
 * An empty/whitespace-only query matches nothing; the caller shows its normal unfiltered subjects list
 * in that case instead of calling this at all.
 */
export function searchSubjectsAndExperiments(
  query: string,
  subjects: readonly SubjectLike[],
  experimentsBySubject: ReadonlyMap<string, readonly NormalizedExperiment[]>,
): SubjectSearchResult {
  const q = query.trim().toLowerCase();

  if (q === "") return { subjects: [], experiments: [] };

  const matchedSubjects = subjects.filter((subject) =>
    matchesQuery(q, subject.title ?? subject.id, subject.description),
  );

  const matchedExperiments: ExperimentSearchMatch[] = [];

  for (const subject of subjects) {
    const subjectTitle = subject.title ?? subject.id;
    const experiments = experimentsBySubject.get(subject.id) ?? [];

    for (const experiment of experiments) {
      if (matchesQuery(q, experiment.title, experiment.aim.join(" "))) {
        matchedExperiments.push({ experiment, subjectTitle });
      }
    }
  }

  return { subjects: matchedSubjects, experiments: matchedExperiments };
}
