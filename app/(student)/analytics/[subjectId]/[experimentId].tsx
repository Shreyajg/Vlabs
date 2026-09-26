import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { GraphChart } from '@/components/ui/GraphChart';
import { IconTile } from '@/components/ui/IconTile';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StateView } from '@/components/ui/StateView';
import { colors, layout, spacing, typography } from '@/constants/theme';

import { describeGraphState } from '../../../../services/calculation/draftRuns';
import { getCurrentUserId } from '../../../../services/authService';
import { getStudentExperimentRunsForExperiment } from '../../../../services/experimentRunService';
import { getExperiment } from '../../../../services/experimentService';
import { buildRunHistoryGraphs } from '../../../../services/reportService';
import type { ExperimentRun } from '../../../../types/ExperimentRun';
import type { NormalizedExperiment } from '../../../../types/Experiment';

type Status = 'loading' | 'ready' | 'signedOut' | 'empty' | 'experimentError' | 'runsError';

const formatSlug = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export default function ExperimentAnalytics() {
  const { subjectId, experimentId } = useLocalSearchParams();
  const subject = String(subjectId);
  const experimentKey = String(experimentId);

  const [status, setStatus] = useState<Status>('loading');
  const [experiment, setExperiment] = useState<NormalizedExperiment | null>(null);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');

      const studentId = getCurrentUserId();

      if (!studentId) {
        if (!cancelled) setStatus('signedOut');
        return;
      }

      let loadedExperiment: NormalizedExperiment | null;

      try {
        loadedExperiment = await getExperiment(subject, experimentKey);
      } catch (err) {
        console.error(`Failed to load experiment "${subject}/${experimentKey}":`, err);

        if (!cancelled) setStatus('experimentError');
        return;
      }

      if (cancelled) return;

      if (!loadedExperiment) {
        setStatus('experimentError');
        return;
      }

      setExperiment(loadedExperiment);

      try {
        // Both studentId and experimentId are filtered in the query itself (getStudentExperimentRunsForExperiment),
        // never getExperimentRuns(), which has no studentId constraint and would be rejected by the rules.
        const savedRuns = await getStudentExperimentRunsForExperiment(studentId, experimentKey);

        if (cancelled) return;

        setRuns(savedRuns);
        setStatus(savedRuns.length === 0 ? 'empty' : 'ready');
      } catch (err) {
        console.error(`Failed to load runs for "${experimentKey}":`, err);

        if (!cancelled) setStatus('runsError');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [subject, experimentKey, attempt]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  if (status !== 'ready' || !experiment) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Analytics" />

        {status === 'loading' ? (
          <StateView variant="loading" message="Loading analytics..." />
        ) : status === 'signedOut' ? (
          <StateView
            variant="empty"
            icon="log-in-outline"
            title="Sign in to see your reports"
            message="Your saved runs are tied to your account."
          />
        ) : status === 'experimentError' ? (
          <StateView
            variant="error"
            title="Experiment unavailable"
            message="This experiment could not be loaded."
            onAction={retry}
          />
        ) : status === 'runsError' ? (
          <StateView
            variant="error"
            message="We could not load your saved runs for this experiment. Check your connection and try again."
            onAction={retry}
          />
        ) : (
          <StateView
            variant="empty"
            icon="analytics-outline"
            title="No saved runs yet"
            message={`Run and save ${experiment ? experiment.title : 'this experiment'} at least once to see analytics here.`}
            actionLabel="Run this Experiment"
            onAction={() =>
              router.push({
                pathname: '/(student)/experiment/[id]',
                params: { id: experimentKey, subjectId: subject },
              })
            }
          />
        )}
      </Screen>
    );
  }

  // getStudentExperimentRunsForExperiment returns newest-first; a trend reads left-to-right in the order
  // the runs actually happened, so the oldest saved run becomes point 1.
  const orderedRuns = [...runs].reverse();
  const generations = buildRunHistoryGraphs(experiment, orderedRuns);

  return (
    <Screen edges={PUSHED_EDGES}>
      <ScreenHeader variant="pushed" title="Analytics" subtitle={experiment.title} />

      <View style={styles.sections}>
        <Card variant="mint" style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <IconTile icon="analytics-outline" tone="mint" />

            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>{experiment.title}</Text>
              <Text style={styles.summaryCaption}>
                {formatSlug(subject)} · {plural(runs.length, 'saved run')}
              </Text>
            </View>
          </View>

          {runs.length < 2 ? (
            <Text style={styles.summaryNote}>
              Trend comparison needs at least two saved runs. Save another run of this experiment to see
              how your results change.
            </Text>
          ) : null}
        </Card>

        {experiment.graphConfigs.length === 0 ? (
          <StateView
            variant="empty"
            fill={false}
            icon="stats-chart-outline"
            title="No graphs defined"
            message="This experiment has no graph configuration to plot."
          />
        ) : (
          <View style={styles.runs}>
            {experiment.graphConfigs.map((graphConfig, index) => {
              const view = describeGraphState(generations[index], runs.length);
              const singlePoint = view.kind === 'message' ? view.graph?.points[0] : undefined;

              return (
                <Card key={`${graphConfig.title}-${index}`} variant="mint" style={styles.graphCard}>
                  <View style={styles.graphHeader}>
                    <IconTile icon="stats-chart-outline" tone="mint" />

                    <View style={styles.graphText}>
                      <Text style={styles.graphTitle}>{graphConfig.title}</Text>
                      <Text style={styles.graphAxis}>X-axis: {graphConfig.xLabel || 'Not specified'}</Text>
                      <Text style={styles.graphAxis}>Y-axis: {graphConfig.yLabel || 'Not specified'}</Text>
                    </View>
                  </View>

                  {view.kind === 'chart' ? (
                    <GraphChart
                      points={view.graph.points}
                      series={view.graph.series?.map((line) => ({ label: line.label, points: line.points }))}
                      xLabel={graphConfig.xLabel}
                      yLabel={graphConfig.yLabel}
                      scale={view.graph.scale}
                      xScale={view.graph.xScale}
                      yScale={view.graph.yScale}
                      accessibilityLabel={`${graphConfig.title}, ${plural(runs.length, 'saved run')}`}
                    />
                  ) : (
                    <Text style={styles.graphMessage}>{view.message}</Text>
                  )}

                  {singlePoint ? (
                    <Text style={styles.graphPoint}>
                      Point: ({singlePoint.x}, {singlePoint.y})
                    </Text>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },
  summaryCard: {
    gap: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  summaryCaption: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  summaryNote: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  runs: {
    gap: layout.cardGap,
  },
  graphCard: {
    gap: spacing.md,
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  graphText: {
    flex: 1,
  },
  graphTitle: {
    ...typography.title,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  graphAxis: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  graphMessage: {
    ...typography.body,
    color: colors.text.strong,
  },
  graphPoint: {
    ...typography.mono,
    color: colors.text.primary,
  },
});
