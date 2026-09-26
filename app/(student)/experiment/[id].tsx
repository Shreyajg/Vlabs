import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExperimentOverview } from '@/components/experiment/ExperimentOverview';
import { Badge } from '@/components/ui/Badge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StateView } from '@/components/ui/StateView';
import { layout, spacing } from '@/constants/theme';

import { getExperiment } from '../../../services/experimentService';

type ExperimentData = Record<string, any>;

type Status = 'loading' | 'ready' | 'notFound' | 'error';

const formatSlug = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

export default function ExperimentPage() {
  const { id, subjectId } = useLocalSearchParams();

  const [experiment, setExperiment] = useState<ExperimentData | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id || !subjectId) return;

    let cancelled = false;

    async function loadExperiment() {
      try {
        const data = (await getExperiment(
          String(subjectId),
          String(id),
        )) as ExperimentData | null;

        if (cancelled) return;

        if (data) {
          setExperiment(data);
          setStatus('ready');
        } else {
          setStatus('notFound');
        }
      } catch (error) {
        console.error('Failed to load experiment:', error);

        if (!cancelled) {
          setStatus('error');
        }
      }
    }

    loadExperiment();

    return () => {
      cancelled = true;
    };
  }, [id, subjectId, attempt]);

  function retry() {
    setStatus('loading');
    setAttempt((count) => count + 1);
  }

  const view: Status = !id || !subjectId ? 'notFound' : status;

  if (view !== 'ready' || !experiment) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Experiment" />

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
            message="This experiment may have been removed or is no longer available."
          />
        )}
      </Screen>
    );
  }

  const inputCount = experiment.inputFields?.length ?? 0;
  const formulaCount = experiment.formulas?.length ?? 0;
  const graphCount = experiment.graphConfigs?.length ?? 0;

  return (
    <Screen
      edges={PUSHED_EDGES}
      footer={
        <PrimaryButton
          title="Start Experiment"
          size="lg"
          icon="arrow-forward"
          iconPosition="right"
          onPress={() =>
            router.push({
              pathname: '/run/[id]',
              params: {
                id: String(id),
                subjectId: String(subjectId),
              },
            })
          }
        />
      }
    >
      <ScreenHeader
        variant="pushed"
        title={experiment.title ?? 'Experiment'}
        subtitle={formatSlug(String(subjectId))}
      />

      {inputCount + formulaCount + graphCount > 0 ? (
        <View style={styles.facts}>
          {inputCount > 0 ? (
            <Badge label={countLabel(inputCount, 'input')} />
          ) : null}
          {formulaCount > 0 ? (
            <Badge label={countLabel(formulaCount, 'formula')} />
          ) : null}
          {graphCount > 0 ? (
            <Badge label={countLabel(graphCount, 'graph')} />
          ) : null}
        </View>
      ) : null}

      <ExperimentOverview
        aim={experiment.aim}
        theory={experiment.theory}
        procedure={experiment.procedure}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: layout.sectionGap,
  },
});
