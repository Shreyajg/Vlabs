import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ExperimentOverview } from '@/components/experiment/ExperimentOverview';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import {
  colors,
  layout,
  spacing,
  typography,
} from '@/constants/theme';

import {
  buildExperimentDetail,
  subjectNameFromId,
  type DetailField,
} from '../../../services/experimentDetail';
import { getExperiment, setExperimentPublished } from '../../../services/experimentService';
import type { NormalizedExperiment } from '../../../types/Experiment';

type Status = 'loading' | 'ready' | 'notFound' | 'error';

// The Faculty detail reads the same Firestore document, through the same service and the same
// normalized schema, as the Student detail, and renders every list in it.
export default function FacultyExperimentDetail() {
  const { id, subjectId } = useLocalSearchParams();

  const [experiment, setExperiment] = useState<NormalizedExperiment | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [publishPending, setPublishPending] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !subjectId) return;

    let cancelled = false;

    async function loadExperiment() {
      try {
        const data = await getExperiment(String(subjectId), String(id));

        if (cancelled) return;

        if (data) {
          setExperiment(data);
          setStatus('ready');
        } else {
          setStatus('notFound');
        }
      } catch (error) {
        console.error('Failed to load experiment:', error);

        if (!cancelled) setStatus('error');
      }
    }

    loadExperiment();

    return () => {
      cancelled = true;
    };
  }, [id, subjectId, attempt]);

  const detail = useMemo(
    () => (experiment ? buildExperimentDetail(experiment) : null),
    [experiment],
  );

  function retry() {
    setStatus('loading');
    setAttempt((count) => count + 1);
  }

  async function togglePublished() {
    if (!experiment || publishPending) return;

    const nextPublished = !experiment.isPublished;

    setPublishPending(true);
    setPublishError(null);

    try {
      await setExperimentPublished(experiment.subjectId, experiment.id, nextPublished);

      // Only reflect the new state once Firestore has actually confirmed the write.
      setExperiment((previous) => (previous ? { ...previous, isPublished: nextPublished } : previous));
    } catch (err) {
      console.error(`Failed to ${nextPublished ? 'publish' : 'unpublish'} ${experiment.subjectId}/${experiment.id}:`, err);
      setPublishError(nextPublished ? 'Could not publish. Try again.' : 'Could not unpublish. Try again.');
    } finally {
      setPublishPending(false);
    }
  }

  const view: Status = !id || !subjectId ? 'notFound' : status;

  if (view !== 'ready' || !experiment || !detail) {
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
            message="This experiment may have been removed."
          />
        )}
      </Screen>
    );
  }

  const published = experiment.isPublished;

  return (
    <Screen
      edges={PUSHED_EDGES}
      footer={
        <View style={styles.footer}>
          {publishError ? <Text style={styles.footerError}>{publishError}</Text> : null}

          <View style={styles.footerButtons}>
            <View style={styles.footerAction}>
              <SecondaryButton
                title={published ? 'Unpublish' : 'Publish'}
                icon={published ? 'eye-off-outline' : 'cloud-upload-outline'}
                loading={publishPending}
                onPress={togglePublished}
              />
            </View>

            <View style={styles.footerAction}>
              <PrimaryButton
                title="Edit Experiment"
                icon="create-outline"
                disabled={publishPending}
                onPress={() =>
                  router.push({
                    pathname: '/(faculty)/experiment/edit/[id]',
                    params: { id: experiment.id, subjectId: experiment.subjectId },
                  })
                }
              />
            </View>
          </View>
        </View>
      }
    >
      <ScreenHeader
        variant="pushed"
        title={detail.title}
        subtitle={subjectNameFromId(String(subjectId))}
      />

      <View style={styles.sections}>
        <Badge
          label={published ? 'Published' : 'Draft'}
          tone={published ? 'published' : 'draft'}
          dot
        />

        <ExperimentOverview
          aim={detail.aim}
          theory={detail.theory}
          procedure={detail.procedure}
        />

        {detail.constants.length > 0 ? (
          <View>
            <SectionTitle title="Constants" />

            <Card variant="peach">
              {detail.constants.map((constant, index) => (
                <View
                  key={constant.key}
                  style={[styles.row, index > 0 && styles.peachDivider]}
                >
                  <Text style={styles.rowLabel}>{constant.label}</Text>

                  <Text style={styles.rowValue}>{constant.value}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {detail.inputs.length > 0 ? (
          <View>
            <SectionTitle
              title="Inputs"
              caption="Set up once for the experiment."
            />

            <Card>
              {detail.inputs.map((field, index) => (
                <FieldRow key={field.key} field={field} divided={index > 0} />
              ))}
            </Card>
          </View>
        ) : null}

        {detail.runInputs.length > 0 ? (
          <View>
            <SectionTitle
              title="Run Inputs"
              caption="Measured by the student for every run."
            />

            <Card>
              {detail.runInputs.map((field, index) => (
                <FieldRow key={field.key} field={field} divided={index > 0} />
              ))}
            </Card>
          </View>
        ) : null}

        {detail.formulas.length > 0 ? (
          <View>
            <SectionTitle title="Formulas" />

            <Card variant="peach">
              {detail.formulas.map((formula, index) => (
                <View
                  key={formula.key}
                  style={index > 0 ? styles.peachDivider : undefined}
                >
                  <Text style={styles.rowLabel}>{formula.name}</Text>

                  {formula.formula ? (
                    <Text style={styles.formula}>{formula.formula}</Text>
                  ) : null}

                  {formula.rules?.map((rule) => (
                    <Text key={rule} style={styles.detail}>
                      Rule: {rule}
                    </Text>
                  ))}
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {detail.outputs.length > 0 ? (
          <View>
            <SectionTitle
              title="Results"
              caption="Shown to the student after each run."
            />

            <Card>
              {detail.outputs.map((output, index) => (
                <View
                  key={output.key}
                  style={index > 0 ? styles.divider : undefined}
                >
                  <Text style={styles.rowLabel}>{output.label}</Text>

                  {output.details.map((line) => (
                    <Text key={line} style={styles.detail}>
                      {line}
                    </Text>
                  ))}
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {detail.graphs.length > 0 ? (
          <View>
            <SectionTitle title="Graphs" />

            <View style={styles.graphs}>
              {detail.graphs.map((graph) => (
                <Card key={graph.key} variant="mint" style={styles.graphCard}>
                  <IconTile icon="stats-chart-outline" tone="mint" />

                  <View style={styles.graphText}>
                    <Text style={styles.graphTitle}>{graph.title}</Text>

                    {graph.type ? (
                      <Text style={styles.graphAxis}>Type: {graph.type}</Text>
                    ) : null}
                    <Text style={styles.graphAxis}>X: {graph.xLabel}</Text>
                    <Text style={styles.graphAxis}>Y: {graph.yLabel}</Text>
                    {graph.scale ? (
                      <Text style={styles.graphAxis}>Scale: {graph.scale}</Text>
                    ) : null}
                    {graph.series ? (
                      <Text style={styles.graphAxis}>
                        Series: {graph.series.join(', ')}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function FieldRow({ field, divided }: { field: DetailField; divided: boolean }) {
  return (
    <View style={divided ? styles.divider : undefined}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{field.label}</Text>

        <Text style={styles.rowValue}>{field.kind}</Text>
      </View>

      {field.details.map((line) => (
        <Text key={line} style={styles.detail}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
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
  detail: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  formula: {
    ...typography.mono,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  divider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  peachDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.peach.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  graphs: {
    gap: layout.cardGap,
  },
  graphCard: {
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
  footer: {
    gap: spacing.sm,
  },
  footerError: {
    ...typography.caption,
    color: colors.error.text,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerAction: {
    flex: 1,
  },
});
