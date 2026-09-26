import { useEffect, useRef, useState } from 'react';

import { getExperiment } from '../services/experimentService';
import { experimentRefKey, missingExperimentRefs } from '../services/reportService';
import type { ExperimentRun } from '../types/ExperimentRun';

/**
 * Resolves and caches each distinct experiment title referenced by `runs`. A saved run only stores
 * subjectId/experimentId (never a title), so this is the one Firestore read per experiment needed to show
 * a human-readable name; an experiment already resolved for an earlier `runs` value is never re-read.
 *
 * The map is keyed by experimentRefKey({ subjectId, experimentId }) — look a run's title up with
 * `titles.get(experimentRefKey(run))`, falling back to `run.experimentId` while it is still resolving or
 * if the experiment could not be loaded.
 */
export function useExperimentTitles(runs: readonly ExperimentRun[]): Map<string, string> {
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const resolvedKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const refs = missingExperimentRefs(runs, resolvedKeys.current);

    if (refs.length === 0) return;

    for (const ref of refs) resolvedKeys.current.add(experimentRefKey(ref));

    (async () => {
      const resolved = await Promise.all(
        refs.map(async (ref) => {
          try {
            const experiment = await getExperiment(ref.subjectId, ref.experimentId);

            return [experimentRefKey(ref), experiment?.title ?? ref.experimentId] as const;
          } catch (err) {
            // A title is a courtesy label; a failed lookup falls back to the raw id rather than the screen.
            console.warn(`Failed to resolve the title of ${ref.subjectId}/${ref.experimentId}:`, err);

            return [experimentRefKey(ref), ref.experimentId] as const;
          }
        }),
      );

      if (!cancelled) setTitles((current) => new Map([...current, ...resolved]));
    })();

    return () => {
      cancelled = true;
    };
  }, [runs]);

  return titles;
}
