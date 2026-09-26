import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ExperimentOverview } from '@/components/experiment/ExperimentOverview';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { GraphChart } from '@/components/ui/GraphChart';
import { IconButton } from '@/components/ui/IconButton';
import { IconTile } from '@/components/ui/IconTile';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { SelectField } from '@/components/ui/SelectField';
import { StateView } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { UnitSelector } from '@/components/ui/UnitSelector';
import {
  colors,
  iconSizes,
  input,
  layout,
  spacing,
  typography,
  type ChipTone,
} from '@/constants/theme';

import { getCurrentUserId } from '../../../services/authService';
import {
  addDraftRun,
  buildRunGraphs,
  calculateAllDraftRuns,
  createDraftRun,
  createSingleFlight,
  describeGraphState,
  editDraftRunUnit,
  editDraftRunValue,
  hasSavedRuns,
  initialQuantities,
  invalidateCalculatedRuns,
  isRunSaved,
  removeDraftRun,
  saveDraftRuns,
  setQuantityUnit,
  setQuantityValue,
  type DraftRun,
  type SaveDraftRunsOutcome,
} from '../../../services/calculation/draftRuns';
import { plottedPointCount } from '../../../services/calculation/graphData';
import { saveExperimentRun } from '../../../services/experimentRunService';
import { getExperiment } from '../../../services/experimentService';
import type { CalculationIssue, QuantityInput, QuantityInputs } from '../../../types/Calculation';
import type { NormalizedExperiment, NormalizedField } from '../../../types/Experiment';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Status = 'loading' | 'ready' | 'notFound' | 'error';

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'result'; tone: 'success' | 'error'; message: string };

interface ExperimentIssues {
  setup: CalculationIssue[];
  definition: CalculationIssue[];
}

const NO_ISSUES: ExperimentIssues = { setup: [], definition: [] };

const formatSlug = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const formatNumber = (value: number) => String(Number(value.toPrecision(6)));

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function runBadge(run: DraftRun): { label: string; tone: ChipTone; icon?: IconName } {
  if (isRunSaved(run)) return { label: 'Saved', tone: 'published', icon: 'cloud-done-outline' };
  if (run.status === 'calculated') {
    return { label: 'Calculated', tone: 'success', icon: 'checkmark-circle-outline' };
  }
  if (run.status === 'error') return { label: 'Error', tone: 'error', icon: 'alert-circle-outline' };

  return { label: 'Draft', tone: 'neutral' };
}

function QuantityField({
  field,
  quantity,
  error,
  disabled,
  onValueChange,
  onUnitChange,
}: {
  field: NormalizedField;
  quantity: QuantityInput | undefined;
  error?: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
}) {
  const value = quantity?.value === undefined ? '' : String(quantity.value);

  if (field.kind === 'choice') {
    return (
      <View style={styles.fieldBlock}>
        <SelectField
          label={field.label}
          value={value}
          options={field.options}
          disabled={disabled}
          onChange={onValueChange}
        />

        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.fieldBlock}>
      <TextField
        label={field.label}
        value={value}
        onChangeText={onValueChange}
        placeholder={`Enter ${field.label}`}
        keyboardType="decimal-pad"
        unit={field.units.length === 1 ? field.units[0] : undefined}
        disabled={disabled}
        error={error}
        helperText={
          field.defaultValue !== undefined ? `Default: ${String(field.defaultValue)}` : undefined
        }
      />

      {field.units.length > 1 ? (
        <UnitSelector
          units={field.units}
          value={quantity?.unit ?? field.units[0]}
          disabled={disabled}
          onChange={onUnitChange}
        />
      ) : null}
    </View>
  );
}

function RunCard({
  run,
  position,
  fields,
  canDelete,
  disabled,
  onValueChange,
  onUnitChange,
  onDelete,
}: {
  run: DraftRun;
  position: number;
  fields: NormalizedField[];
  canDelete: boolean;
  disabled: boolean;
  onValueChange: (key: string, value: string) => void;
  onUnitChange: (key: string, unit: string) => void;
  onDelete: () => void;
}) {
  const saved = isRunSaved(run);
  const badge = runBadge(run);

  const fieldErrors: Record<string, string> = {};
  const messages: string[] = [];

  for (const issue of run.errors) {
    if (issue.fieldKey) {
      if (!fieldErrors[issue.fieldKey]) fieldErrors[issue.fieldKey] = issue.userMessage;
    } else if (!messages.includes(issue.userMessage)) {
      messages.push(issue.userMessage);
    }
  }

  return (
    <Card padding="feature" style={styles.runCard}>
      <View style={styles.runHeader}>
        <View style={styles.runTitleRow}>
          <Text style={styles.runTitle}>Run {position}</Text>

          <Badge label={badge.label} tone={badge.tone} icon={badge.icon} />
        </View>

        {canDelete && !saved ? (
          <IconButton
            icon="trash-outline"
            tone="danger"
            accessibilityLabel={`Delete Run ${position}`}
            onPress={onDelete}
          />
        ) : null}
      </View>

      {fields.length === 0 ? (
        <Text style={styles.rowLabel}>This experiment has no per-run measurements.</Text>
      ) : (
        fields.map((field) => (
          <QuantityField
            key={field.key}
            field={field}
            quantity={run.runValues[field.key]}
            error={fieldErrors[field.key]}
            disabled={disabled || saved}
            onValueChange={(value) => onValueChange(field.key, value)}
            onUnitChange={(unit) => onUnitChange(field.key, unit)}
          />
        ))
      )}

      {messages.map((message) => (
        <Text key={message} style={styles.fieldError}>
          {message}
        </Text>
      ))}

      {run.saveError ? <Text style={styles.fieldError}>{run.saveError}</Text> : null}
    </Card>
  );
}

export default function RunExperiment() {
  const { id, subjectId } = useLocalSearchParams();

  const experimentId = String(id);
  const subject = String(subjectId);

  const [experiment, setExperiment] = useState<NormalizedExperiment | null>(null);
  const [setup, setSetup] = useState<QuantityInputs>({});
  const [runs, setRuns] = useState<DraftRun[]>([]);
  const [experimentIssues, setExperimentIssues] = useState<ExperimentIssues>(NO_ISSUES);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const startedAt = useRef<Date | null>(null);
  const runCounter = useRef(0);
  const [singleFlight] = useState(() => createSingleFlight<SaveDraftRunsOutcome>());

  function nextRunId() {
    runCounter.current += 1;

    return `draft-${runCounter.current}`;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadExperiment() {
      try {
        const data = await getExperiment(subject, experimentId);

        if (cancelled) return;

        if (!data) {
          setStatus('notFound');
          return;
        }

        startedAt.current = new Date();
        runCounter.current = 1;
        setExperiment(data);
        setSetup(initialQuantities(data.inputFields));
        setRuns([createDraftRun('draft-1', data.runFields)]);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load experiment:', err);

        if (!cancelled) {
          setStatus('error');
        }
      }
    }

    loadExperiment();

    return () => {
      cancelled = true;
    };
  }, [experimentId, subject, attempt]);

  function retry() {
    setStatus('loading');
    setAttempt((count) => count + 1);
  }

  const saving = saveState.status === 'saving';
  const setupLocked = hasSavedRuns(runs);

  // Setup values feed every calculation, so changing one invalidates all calculated runs.
  function editSetup(change: (current: QuantityInputs) => QuantityInputs) {
    if (saving || setupLocked) return;

    setSetup(change);
    setRuns((previous) => invalidateCalculatedRuns(previous));
    setExperimentIssues((previous) => ({ ...previous, setup: [] }));
    setSaveState({ status: 'idle' });
  }

  function editRun(change: (previous: DraftRun[]) => DraftRun[]) {
    if (saving) return;

    setRuns(change);
    setSaveState({ status: 'idle' });
  }

  function addRun() {
    if (!experiment) return;

    const runId = nextRunId();

    editRun((previous) => addDraftRun(previous, runId, experiment.runFields));
  }

  async function handleCalculateAll() {
    if (!experiment || calculating || saving) return;

    setCalculating(true);
    setSaveState({ status: 'idle' });

    // Let the loading state paint before the (synchronous) calculations run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const outcome = calculateAllDraftRuns({ experiment, setup, runs });

      setRuns(outcome.runs);
      setExperimentIssues({ setup: outcome.setupIssues, definition: outcome.definitionIssues });

      for (const issue of [...outcome.setupIssues, ...outcome.definitionIssues]) {
        console.warn(`[run] ${subject}/${experimentId}: ${issue.code}: ${issue.message}`);
      }

      for (const run of outcome.runs) {
        for (const issue of run.errors) {
          console.warn(`[run] ${run.id}: ${issue.code}: ${issue.message}`);
        }
      }
    } catch (err) {
      console.error('Unexpected calculation failure:', err);
      setSaveState({
        status: 'result',
        tone: 'error',
        message: 'Unable to calculate this result. Please check your entered values.',
      });
    } finally {
      setCalculating(false);
    }
  }

  async function handleSaveAll() {
    if (!experiment || saving) return;

    const studentId = getCurrentUserId();

    if (!studentId) {
      setSaveState({ status: 'result', tone: 'error', message: 'Sign in to save your runs.' });
      return;
    }

    setSaveState({ status: 'saving' });

    try {
      const outcome = await singleFlight(() =>
        saveDraftRuns({
          runs,
          save: (run) => {
            if (!run.result) throw new Error('Cannot save a run that has not been calculated.');

            return saveExperimentRun({
              studentId,
              subjectId: subject,
              experimentId,
              inputs: setup,
              runValues: run.runValues,
              results: run.result.results,
              graphData: run.result.graphData,
              startedAt: startedAt.current ?? new Date(),
            });
          },
          onError: (run, error) => console.error(`Failed to save ${run.id}:`, error),
        }),
      );

      setRuns(outcome.runs);

      if (outcome.failedRunIds.length === 0) {
        setSaveState({
          status: 'result',
          tone: 'success',
          message: `${plural(outcome.savedCount, 'run')} saved.`,
        });
      } else {
        const failed = outcome.failedRunIds
          .map((runId) => `Run ${outcome.runs.findIndex((run) => run.id === runId) + 1}`)
          .join(', ');

        setSaveState({
          status: 'result',
          tone: 'error',
          message: `${outcome.savedCount} saved. ${failed} could not be saved. Your entries are kept, so you can try again.`,
        });
      }
    } catch (err) {
      console.error('Unexpected save failure:', err);
      setSaveState({
        status: 'result',
        tone: 'error',
        message: 'We could not save your runs. Please try again.',
      });
    }
  }

  if (status !== 'ready' || !experiment) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Run Experiment" />

        {status === 'loading' ? (
          <StateView variant="loading" message="Loading experiment..." />
        ) : status === 'error' ? (
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

  const hasRunFields = experiment.runFields.length > 0;
  const calculatedRuns = runs.filter((run) => run.status === 'calculated');
  const unsavedCalculated = calculatedRuns.filter((run) => !isRunSaved(run));
  const canSave = unsavedCalculated.length > 0 && !saving;

  const setupErrors: Record<string, string> = {};

  for (const issue of experimentIssues.setup) {
    if (issue.fieldKey && !setupErrors[issue.fieldKey]) setupErrors[issue.fieldKey] = issue.userMessage;
  }

  const definitionMessages: string[] = [];

  for (const issue of experimentIssues.definition) {
    if (!definitionMessages.includes(issue.userMessage)) definitionMessages.push(issue.userMessage);
  }

  const erroredRuns = runs
    .map((run, index) => (run.status === 'error' ? `Run ${index + 1}` : null))
    .filter((label): label is string => label !== null);

  const showBanner =
    definitionMessages.length > 0 || experimentIssues.setup.length > 0 || erroredRuns.length > 0;

  const generations = buildRunGraphs(experiment, runs);

  return (
    <Screen
      edges={PUSHED_EDGES}
      footer={
        <View style={styles.footer}>
          {saveState.status === 'result' ? (
            <View style={styles.notice}>
              <Ionicons
                name={saveState.tone === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={iconSizes.banner}
                color={saveState.tone === 'success' ? colors.teal.icon : colors.error.solid}
              />

              <Text
                style={[styles.noticeText, saveState.tone === 'error' && styles.noticeError]}
              >
                {saveState.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.footerButtons}>
            <View style={styles.footerAction}>
              <SecondaryButton
                title="Save All Runs"
                icon="save-outline"
                disabled={!canSave}
                loading={saving}
                onPress={handleSaveAll}
              />
            </View>

            <View style={styles.footerAction}>
              <PrimaryButton
                title="Calculate All"
                icon="calculator-outline"
                disabled={saving}
                loading={calculating}
                onPress={handleCalculateAll}
              />
            </View>
          </View>
        </View>
      }
    >
      <ScreenHeader
        variant="pushed"
        title={experiment.title}
        subtitle={formatSlug(experiment.subjectId || subject)}
      />

      <View style={styles.sections}>
        <ExperimentOverview
          aim={experiment.aim}
          theory={experiment.theory}
          procedure={experiment.procedure}
        />

        {experiment.constants.length > 0 ? (
          <View>
            <SectionTitle
              title="Constants"
              caption="Fixed values used in the calculations."
            />

            <Card variant="peach">
              {experiment.constants.map((constant, index) => (
                <View
                  key={`${constant.key ?? constant.name}-${index}`}
                  style={[styles.row, index > 0 && styles.peachDivider]}
                >
                  <Text style={styles.rowLabel}>{constant.name}</Text>

                  <Text style={styles.rowValue}>
                    {constant.value}
                    {constant.unit ? ` ${constant.unit}` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {experiment.inputFields.length > 0 ? (
          <View>
            <SectionTitle
              title="Experiment Inputs"
              caption={
                setupLocked
                  ? 'Locked because runs were saved. Reopen the experiment to start a new session.'
                  : 'Enter these once. They are used for every run.'
              }
            />

            <Card padding="feature" style={styles.fields}>
              {experiment.inputFields.map((field) => (
                <QuantityField
                  key={field.key}
                  field={field}
                  quantity={setup[field.key]}
                  error={setupErrors[field.key]}
                  disabled={saving || setupLocked}
                  onValueChange={(value) =>
                    editSetup((current) => setQuantityValue(current, field.key, value))
                  }
                  onUnitChange={(unit) =>
                    editSetup((current) => setQuantityUnit(current, field.key, unit))
                  }
                />
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionTitle
            title="Experimental Runs"
            caption="Enter each run's measurements. Nothing is saved until you choose Save All Runs."
          />

          <View style={styles.runs}>
            {showBanner ? (
              <Card style={styles.errorCard}>
                <View style={styles.errorHeader}>
                  <Ionicons
                    name="alert-circle"
                    size={iconSizes.banner}
                    color={colors.error.solid}
                  />

                  <Text style={styles.errorTitle}>
                    {definitionMessages.length > 0 ? 'Unable to calculate' : 'Some runs need attention'}
                  </Text>
                </View>

                {definitionMessages.map((message) => (
                  <Text key={message} style={styles.errorText}>
                    {message}
                  </Text>
                ))}

                {experimentIssues.setup.length > 0 ? (
                  <Text style={styles.errorText}>
                    Please check the highlighted experiment inputs.
                  </Text>
                ) : null}

                {erroredRuns.length > 0 ? (
                  <Text style={styles.errorText}>Please check {erroredRuns.join(', ')}.</Text>
                ) : null}
              </Card>
            ) : null}

            {runs.map((run, index) => (
              <RunCard
                key={run.id}
                run={run}
                position={index + 1}
                fields={experiment.runFields}
                canDelete={hasRunFields && runs.length > 1}
                disabled={saving}
                onValueChange={(key, value) =>
                  editRun((previous) => editDraftRunValue(previous, run.id, key, value))
                }
                onUnitChange={(key, unit) =>
                  editRun((previous) => editDraftRunUnit(previous, run.id, key, unit))
                }
                onDelete={() => editRun((previous) => removeDraftRun(previous, run.id))}
              />
            ))}

            {hasRunFields ? (
              <SecondaryButton
                title="Add Run"
                icon="add"
                disabled={saving}
                onPress={addRun}
              />
            ) : null}
          </View>
        </View>

        {calculatedRuns.length > 0 ? (
          <View>
            <SectionTitle
              title="Results"
              caption="Calculated results for each run."
            />

            <View style={styles.runs}>
              {runs.map((run, index) =>
                run.status === 'calculated' && run.result ? (
                  <Card key={run.id} variant="mint">
                    <Text style={styles.resultTitle}>Run {index + 1}</Text>

                    {run.result.outputs.length === 0 ? (
                      <Text style={styles.rowLabel}>No results to display.</Text>
                    ) : (
                      run.result.outputs.map((output) => (
                        <View key={output.key} style={[styles.row, styles.mintDivider]}>
                          <Text style={styles.rowLabel}>{output.label}</Text>

                          <Text style={styles.rowValue}>{output.displayValue}</Text>
                        </View>
                      ))
                    )}
                  </Card>
                ) : null,
              )}
            </View>
          </View>
        ) : null}

        {experiment.formulas.length > 0 ? (
          <View>
            <SectionTitle
              title="Formulas"
              caption="Relations applied to your inputs."
            />

            <Card variant="peach">
              {experiment.formulas.map((formula, index) => (
                <View
                  key={`${formula.key ?? formula.name}-${index}`}
                  style={index > 0 ? styles.peachDivider : undefined}
                >
                  <Text style={styles.rowLabel}>{formula.name}</Text>

                  <Text style={styles.formula}>
                    {formula.formula ?? formula.expression}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {experiment.graphConfigs.length > 0 ? (
          <View>
            <SectionTitle
              title="Graphs"
              caption="Built from all of your calculated runs."
            />

            <View style={styles.runs}>
              {experiment.graphConfigs.map((graph, index) => {
                const view = describeGraphState(generations[index], calculatedRuns.length);
                const singlePoint = view.kind === 'message' ? view.graph?.points[0] : undefined;

                return (
                  <Card
                    key={`${graph.title}-${index}`}
                    variant="mint"
                    style={styles.graphCard}
                  >
                    <View style={styles.graphHeader}>
                      <IconTile icon="stats-chart-outline" tone="mint" />

                      <View style={styles.graphText}>
                        <Text style={styles.graphTitle}>{graph.title}</Text>

                        <Text style={styles.graphAxis}>
                          X-axis: {graph.xLabel || 'Not specified'}
                        </Text>

                        <Text style={styles.graphAxis}>
                          Y-axis: {graph.yLabel || 'Not specified'}
                        </Text>
                      </View>
                    </View>

                    {view.kind === 'chart' ? (
                      <GraphChart
                        points={view.graph.points}
                        series={view.graph.series?.map((line) => ({
                          label: line.label,
                          points: line.points,
                        }))}
                        xLabel={graph.xLabel}
                        yLabel={graph.yLabel}
                        scale={view.graph.scale}
                        xScale={view.graph.xScale}
                        yScale={view.graph.yScale}
                        accessibilityLabel={`${graph.title}, ${plural(plottedPointCount(view.graph), 'point')}${
                          view.graph.series ? `, ${view.graph.series.length} series` : ''
                        }`}
                      />
                    ) : (
                      <Text style={styles.graphMessage}>{view.message}</Text>
                    )}

                    {singlePoint ? (
                      <Text style={styles.graphPoint}>
                        Point: ({formatNumber(singlePoint.x)}, {formatNumber(singlePoint.y)})
                      </Text>
                    ) : null}

                    {view.notes.map((note) => (
                      <Text key={note} style={styles.graphAxis}>
                        {note}
                      </Text>
                    ))}
                  </Card>
                );
              })}
            </View>
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
  fields: {
    gap: input.fieldGap,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldError: {
    ...typography.caption,
    color: colors.error.text,
  },
  runs: {
    gap: layout.cardGap,
  },
  runCard: {
    gap: input.fieldGap,
  },
  runHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  runTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
  },
  runTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  resultTitle: {
    ...typography.h3,
    color: colors.text.primary,
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
  formula: {
    ...typography.mono,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  peachDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.peach.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  mintDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.mint.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  errorCard: {
    backgroundColor: colors.error.bgSubtle,
    borderColor: colors.error.border,
    gap: spacing.sm,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.title,
    color: colors.error.text,
  },
  errorText: {
    ...typography.body,
    color: colors.error.text,
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
  footer: {
    gap: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noticeText: {
    ...typography.caption,
    color: colors.text.strong,
    flex: 1,
  },
  noticeError: {
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
