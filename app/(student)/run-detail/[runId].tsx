import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { GraphChart } from '@/components/ui/GraphChart';
import { IconTile } from '@/components/ui/IconTile';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import { colors, layout, spacing, typography } from '@/constants/theme';

import { formatOutputValue } from '../../../services/calculation/calculateExperiment';
import { describeGraphState } from '../../../services/calculation/draftRuns';
import { getCurrentUserId } from '../../../services/authService';
import { getStudentExperimentRunById } from '../../../services/experimentRunService';
import { getExperiment } from '../../../services/experimentService';
import { buildRunHistoryGraphs, formatRunTimestamp } from '../../../services/reportService';
import type { QuantityInput } from '../../../types/Calculation';
import type { ExperimentRun } from '../../../types/ExperimentRun';
import type { NormalizedExperiment, NormalizedField } from '../../../types/Experiment';

type Status = 'loading' | 'ready' | 'signedOut' | 'notFound' | 'runError' | 'experimentError';

const formatSlug = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

function formatQuantity(quantity: QuantityInput | undefined): string | null {
  if (!quantity) return null;

  return quantity.unit ? `${quantity.value} ${quantity.unit}` : String(quantity.value);
}

function QuantityRow({ field, quantity, divider }: { field: NormalizedField; quantity?: QuantityInput; divider: boolean }) {
  const display = formatQuantity(quantity);

  // A saved run's inputs/runValues can, in principle, be missing a key the current experiment definition
  // has since added — the document is frozen, the definition is not. Skip rather than show a blank row.
  if (display === null) return null;

  return (
    <View style={[styles.row, divider && styles.mintDivider]}>
      <Text style={styles.rowLabel}>{field.label}</Text>
      <Text style={styles.rowValue}>{display}</Text>
    </View>
  );
}

export default function RunDetail() {
  const { runId } = useLocalSearchParams();
  const id = String(runId);

  const [status, setStatus] = useState<Status>('loading');
  const [run, setRun] = useState<ExperimentRun | null>(null);
  const [experiment, setExperiment] = useState<NormalizedExperiment | null>(null);
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

      let loadedRun: ExperimentRun | null;

      try {
        loadedRun = await getStudentExperimentRunById(studentId, id);
      } catch (err) {
        console.error(`Failed to load run "${id}":`, err);

        if (!cancelled) setStatus('runError');
        return;
      }

      if (cancelled) return;

      // A missing run and a run that belongs to someone else look identical here on purpose: nothing
      // about another student's saved run is revealed, not even that it exists.
      if (!loadedRun) {
        setStatus('notFound');
        return;
      }

      setRun(loadedRun);

      try {
        const loadedExperiment = await getExperiment(loadedRun.subjectId, loadedRun.experimentId);

        if (cancelled) return;

        if (!loadedExperiment) {
          setStatus('experimentError');
          return;
        }

        setExperiment(loadedExperiment);
        setStatus('ready');
      } catch (err) {
        console.error(`Failed to load experiment "${loadedRun.subjectId}/${loadedRun.experimentId}":`, err);

        if (!cancelled) setStatus('experimentError');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  if (status !== 'ready' || !run || !experiment) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Saved Run" />

        {status === 'loading' ? (
          <StateView variant="loading" message="Loading your saved run..." />
        ) : status === 'signedOut' ? (
          <StateView
            variant="empty"
            icon="log-in-outline"
            title="Sign in to see your reports"
            message="Your saved runs are tied to your account."
          />
        ) : status === 'notFound' ? (
          <StateView
            variant="empty"
            icon="search-outline"
            title="Run not found"
            message="This saved run does not exist, or is not one of yours."
          />
        ) : status === 'experimentError' ? (
          <StateView
            variant="error"
            title="Experiment unavailable"
            message="This run was found, but its experiment could not be loaded, so its results cannot be shown."
            onAction={retry}
          />
        ) : (
          <StateView
            variant="error"
            message="We could not load this run. Check your connection and try again."
            onAction={retry}
          />
        )}
      </Screen>
    );
  }

  const outputRows = experiment.outputs
    .filter((output) => Object.prototype.hasOwnProperty.call(run.results, output.key))
    .map((output) => ({
      key: output.key,
      label: output.label,
      display: formatOutputValue(run.results[output.key], output.decimals),
    }));

  const generations = buildRunHistoryGraphs(experiment, [run]);

  return (
    <Screen edges={PUSHED_EDGES}>
      <ScreenHeader variant="pushed" title={experiment.title} subtitle={formatSlug(run.subjectId)} />

      <View style={styles.sections}>
        <Card variant="mint" style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <IconTile icon="document-text-outline" tone="mint" />

            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>Saved Run</Text>
              <Text style={styles.summaryCaption}>Saved on {formatRunTimestamp(run.completedAt)}</Text>
            </View>

            <Badge label="Saved" tone="published" icon="cloud-done-outline" />
          </View>
        </Card>

        {experiment.inputFields.length > 0 ? (
          <View>
            <SectionTitle title="Setup Inputs" caption="Shared by every run of this session." />

            <Card padding="feature">
              {experiment.inputFields.map((field, index) => (
                <QuantityRow
                  key={field.key}
                  field={field}
                  quantity={run.inputs[field.key]}
                  divider={index > 0}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {experiment.runFields.length > 0 ? (
          <View>
            <SectionTitle title="Run Values" caption="Entered for this run only." />

            <Card padding="feature">
              {experiment.runFields.map((field, index) => (
                <QuantityRow
                  key={field.key}
                  field={field}
                  quantity={run.runValues[field.key]}
                  divider={index > 0}
                />
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionTitle title="Calculated Outputs" />

          <Card variant="mint">
            {outputRows.length === 0 ? (
              <Text style={styles.rowLabel}>No results were recorded for this run.</Text>
            ) : (
              outputRows.map((row, index) => (
                <View key={row.key} style={[styles.row, index > 0 && styles.mintDivider]}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowValue}>{row.display}</Text>
                </View>
              ))
            )}
          </Card>
        </View>

        {experiment.graphConfigs.length > 0 ? (
          <View>
            <SectionTitle
              title="Graphs"
              caption="Built from this saved run only, not a multi-run trend."
            />

            <View style={styles.runs}>
              {experiment.graphConfigs.map((graphConfig, index) => {
                const view = describeGraphState(generations[index], 1);
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
                        accessibilityLabel={`${graphConfig.title}, this saved run only`}
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

            <SecondaryButton
              title="View Analytics for this Experiment"
              icon="analytics-outline"
              onPress={() =>
                router.push({
                  pathname: '/(student)/analytics/[subjectId]/[experimentId]',
                  params: { subjectId: run.subjectId, experimentId: run.experimentId },
                })
              }
            />
          </View>
        ) : null}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    ...typography.label,
    color: colors.text.strong,
    flexShrink: 1,
  },
  rowValue: {
    ...typography.mono,
    color: colors.text.primary,
    textAlign: 'right',
    flexShrink: 1,
  },
  mintDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.mint.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
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
