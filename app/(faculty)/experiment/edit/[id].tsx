import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ExperimentForm } from '@/components/faculty/ExperimentForm';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StateView } from '@/components/ui/StateView';

import { experimentToFormValues, type ExperimentFormValues } from '../../../../services/experimentAuthoring';
import { getExperiment } from '../../../../services/experimentService';

type Status = 'loading' | 'ready' | 'notFound' | 'error';

export default function EditExperiment() {
  const { id, subjectId } = useLocalSearchParams();
  const experimentId = typeof id === 'string' ? id : undefined;
  const subject = typeof subjectId === 'string' ? subjectId : undefined;

  const [status, setStatus] = useState<Status>('loading');
  const [initialValues, setInitialValues] = useState<ExperimentFormValues | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!experimentId || !subject) return;

    let cancelled = false;

    async function load() {
      setStatus('loading');

      try {
        const experiment = await getExperiment(subject as string, experimentId as string);

        if (cancelled) return;

        if (!experiment) {
          setStatus('notFound');
          return;
        }

        setInitialValues(experimentToFormValues(experiment));
        setIsPublished(experiment.isPublished);
        setStatus('ready');
      } catch (error) {
        console.error('Failed to load experiment for editing:', error);

        if (!cancelled) setStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [experimentId, subject, attempt]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  const view: Status = !experimentId || !subject ? 'notFound' : status;

  if (view !== 'ready' || !initialValues) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Edit Experiment" />

        {view === 'loading' ? (
          <StateView variant="loading" message="Loading experiment..." />
        ) : view === 'error' ? (
          <StateView
            variant="error"
            message="We could not load this experiment. Check your connection and try again."
            onAction={retry}
          />
        ) : (
          <StateView
            variant="empty"
            icon="search-outline"
            title="Experiment not found"
            message="This experiment may have been removed."
          />
        )}
      </Screen>
    );
  }

  return (
    <ExperimentForm
      mode="edit"
      subjectId={subject}
      experimentId={experimentId}
      isPublished={isPublished}
      initialValues={initialValues}
    />
  );
}
