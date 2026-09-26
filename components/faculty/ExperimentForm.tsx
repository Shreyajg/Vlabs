import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ItemListEditor,
  type ListItem,
} from '@/components/faculty/ItemListEditor';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  iconSizes,
  input,
  layout,
  spacing,
  typography,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import {
  buildExperimentDraft,
  draftToRawExperimentData,
  slugifyExperimentId,
  type ExperimentFormValues,
} from '../../services/experimentAuthoring';
import { createExperiment, updateExperiment } from '../../services/experimentService';
import { getSubjects } from '../../services/subjectService';

export type ExperimentFormProps = {
  mode: 'create' | 'edit';
  /** Ignored in create mode: a new experiment always starts as a draft. */
  isPublished?: boolean;
  initialValues: ExperimentFormValues;
  /** Required in edit mode: which real document to write back to. */
  subjectId?: string;
  experimentId?: string;
};

type Notice = { tone: 'success' | 'error'; text: string };

const CONSTANT_FIELDS = [
  { key: 'key', label: 'Variable Key', placeholder: 'gravity' },
  { key: 'name', label: 'Name', placeholder: 'Acceleration due to Gravity' },
  { key: 'value', label: 'Value', placeholder: '9.81', numeric: true },
  { key: 'unit', label: 'Unit', placeholder: 'm/s²' },
  { key: 'symbol', label: 'Symbol (optional)', placeholder: 'g' },
];

const FIELD_FIELDS = [
  { key: 'key', label: 'Variable Key', placeholder: 'pipeDiameter' },
  { key: 'label', label: 'Label', placeholder: 'Pipe Diameter' },
  { key: 'type', label: 'Type: number or choice', placeholder: 'number' },
  { key: 'units', label: 'Units (comma-separated)', placeholder: 'm, cm, mm' },
  { key: 'defaultUnit', label: 'Default Unit', placeholder: 'm' },
  { key: 'calculationUnit', label: 'Calculation Unit (optional)', placeholder: 'm' },
  { key: 'defaultValue', label: 'Default Value (optional)', placeholder: '1000', numeric: true },
  { key: 'options', label: 'Choices, for a "choice" field (comma-separated)', placeholder: 'Yes, No' },
  { key: 'optional', label: 'Optional field? (true or blank)', placeholder: 'true' },
];

const FORMULA_FIELDS = [
  { key: 'key', label: 'Variable Key', placeholder: 'NRe' },
  { key: 'name', label: 'Name', placeholder: 'Reynolds Number' },
  { key: 'formula', label: 'Display Formula (human-readable)', placeholder: 'Re = ρVD / μ' },
  {
    key: 'expression',
    label: 'Calculation Expression (machine-evaluable)',
    placeholder: 'density * V * pipeDiameter / viscosity',
  },
];

const OUTPUT_FIELDS = [
  { key: 'key', label: 'Variable Key', placeholder: 'NRe' },
  { key: 'label', label: 'Label', placeholder: 'Re' },
  { key: 'decimals', label: 'Decimals (optional)', placeholder: '4', numeric: true },
  { key: 'unit', label: 'Unit (optional)', placeholder: 'm/s' },
];

const GRAPH_FIELDS = [
  { key: 'title', label: 'Title', placeholder: 'f vs Reynolds Number' },
  { key: 'xKey', label: 'X Variable Key', placeholder: 'NRe' },
  { key: 'yKey', label: 'Y Variable Key', placeholder: 'f' },
  { key: 'xAxis', label: 'X-axis Label', placeholder: 'Reynolds Number' },
  { key: 'yAxis', label: 'Y-axis Label', placeholder: 'Friction Factor' },
  { key: 'scale', label: 'Scale: linear or log', placeholder: 'linear' },
];

export function ExperimentForm({
  mode,
  isPublished = false,
  initialValues,
  subjectId,
  experimentId,
}: ExperimentFormProps) {
  const { user } = useAuth();

  const [values, setValues] = useState(initialValues);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>([]);
  const [subjectsError, setSubjectsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getSubjects()
      .then((data) => {
        if (cancelled) return;

        setSubjects(
          data.map((subject) => ({
            id: subject.id,
            title: (subject as { title?: string }).title ?? subject.id,
          })),
        );
      })
      .catch((err) => {
        console.error('Failed to load subjects:', err);

        if (!cancelled) setSubjectsError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function setField<K extends keyof ExperimentFormValues>(
    key: K,
    value: ExperimentFormValues[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function updateStep(index: number, text: string) {
    setField(
      'procedure',
      values.procedure.map((step, stepIndex) =>
        stepIndex === index ? text : step,
      ),
    );
  }

  function removeStep(index: number) {
    setField(
      'procedure',
      values.procedure.filter((_, stepIndex) => stepIndex !== index),
    );
  }

  const subjectTitle = subjects.find((subject) => subject.id === values.subjectId)?.title
    ?? values.subjectId;
  const subjectOptions = subjects.map((subject) => subject.title);
  const previewId = mode === 'create' ? slugifyExperimentId(values.title) : experimentId;

  async function handleSubmit() {
    if (submitting) return;

    if (!values.title.trim()) {
      setTitleError('Enter an experiment title.');
      setNotice({ tone: 'error', text: 'Add an experiment title before saving.' });
      return;
    }

    setTitleError(undefined);

    const { draft, errors } = buildExperimentDraft(values);

    if (!draft) {
      setFormErrors(errors);
      setNotice({
        tone: 'error',
        text: `Fix ${errors.length} issue${errors.length === 1 ? '' : 's'} before saving — see below.`,
      });
      return;
    }

    setFormErrors([]);
    setSubmitting(true);
    setNotice(null);

    try {
      if (mode === 'create') {
        if (!user?.uid) throw new Error('Sign in again to create an experiment.');

        const id = slugifyExperimentId(draft.title);

        if (!id) {
          setNotice({
            tone: 'error',
            text: 'Could not generate an id from this title. Use letters or numbers in the title.',
          });
          setSubmitting(false);
          return;
        }

        await createExperiment(draft.subjectId, id, draftToRawExperimentData(draft), user.uid);
      } else {
        if (!subjectId || !experimentId) throw new Error('Missing experiment reference.');

        await updateExperiment(subjectId, experimentId, draftToRawExperimentData(draft));
      }

      router.replace('/(faculty)/(tabs)/experiments');
    } catch (err) {
      console.error(`Failed to ${mode === 'create' ? 'create' : 'save'} experiment:`, err);

      const message = err instanceof Error ? err.message : '';

      setNotice({
        tone: 'error',
        text: message.includes('already exists')
          ? 'An experiment with this title already exists. Choose a different title.'
          : mode === 'create'
            ? 'Could not create the experiment. Please try again.'
            : 'Could not save your changes. Please try again.',
      });
      setSubmitting(false);
    }
  }

  return (
    <Screen
      edges={PUSHED_EDGES}
      footer={
        <View style={styles.footer}>
          {notice ? (
            <View style={styles.notice}>
              <Ionicons
                name={notice.tone === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={iconSizes.banner}
                color={
                  notice.tone === 'success'
                    ? colors.teal.icon
                    : colors.error.solid
                }
              />

              <Text
                style={[
                  styles.noticeText,
                  notice.tone === 'error' && styles.noticeError,
                ]}
              >
                {notice.text}
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            title={mode === 'create' ? 'Create Experiment' : 'Save Changes'}
            icon={mode === 'create' ? 'add-circle-outline' : 'save-outline'}
            loading={submitting}
            onPress={handleSubmit}
          />
        </View>
      }
    >
      <ScreenHeader
        variant="pushed"
        title={mode === 'create' ? 'Create Experiment' : 'Edit Experiment'}
        subtitle={
          mode === 'create'
            ? 'Create a new laboratory experiment'
            : initialValues.title
        }
      />

      <View style={styles.sections}>
        {mode === 'create' ? (
          <Card variant="peach" style={styles.callout}>
            <Badge label="Draft" tone="draft" dot />
            <Text style={styles.calloutText}>
              New experiments start as a draft. Publish it from the Experiments list once it is ready.
            </Text>
          </Card>
        ) : (
          <Card variant={isPublished ? 'mint' : 'peach'} style={styles.callout}>
            <Badge
              label={isPublished ? 'Published' : 'Draft'}
              tone={isPublished ? 'published' : 'draft'}
              dot
            />
            <Text style={styles.calloutText}>
              Publishing is managed from the experiment&apos;s detail page, not this form — saving here
              never changes whether students can see it.
            </Text>
          </Card>
        )}

        {formErrors.length > 0 ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons name="alert-circle" size={iconSizes.banner} color={colors.error.solid} />
              <Text style={styles.errorTitle}>
                {formErrors.length} issue{formErrors.length === 1 ? '' : 's'} to fix
              </Text>
            </View>

            {formErrors.map((message) => (
              <Text key={message} style={styles.errorText}>
                {message}
              </Text>
            ))}
          </Card>
        ) : null}

        <View>
          <SectionTitle title="Basic Information" />

          <Card padding="feature" style={styles.fields}>
            <TextField
              label="Experiment Title"
              placeholder="Flow Through Circular Pipes"
              value={values.title}
              onChangeText={(text) => {
                setField('title', text);
                setTitleError(undefined);
              }}
              error={titleError}
              helperText={
                mode === 'create' && previewId
                  ? `Will be saved with id "${previewId}"`
                  : mode === 'edit'
                    ? `id: ${previewId}`
                    : undefined
              }
            />

            {mode === 'create' ? (
              <SelectField
                label="Subject"
                value={subjectTitle}
                options={subjectOptions}
                placeholder={subjectsError ? 'Could not load subjects' : 'Select a subject'}
                onChange={(title) => {
                  const chosen = subjects.find((subject) => subject.title === title);

                  if (chosen) setField('subjectId', chosen.id);
                }}
              />
            ) : (
              <TextField label="Subject" value={subjectTitle} disabled />
            )}

            <TextField
              label="Aim"
              placeholder="Determine the pressure drop through a circular pipe."
              helperText="Add one objective per line."
              value={values.aim}
              onChangeText={(text) => setField('aim', text)}
              multiline
              numberOfLines={3}
            />
          </Card>
        </View>

        <View>
          <SectionTitle title="Theory" />

          <Card padding="feature">
            <TextField
              accessibilityLabel="Theory"
              placeholder="Describe the theory behind this experiment."
              value={values.theory}
              onChangeText={(text) => setField('theory', text)}
              multiline
              numberOfLines={6}
            />
          </Card>
        </View>

        <View>
          <SectionTitle
            title="Procedure"
            caption="Steps students follow, in order."
          />

          <Card style={styles.steps}>
            {values.procedure.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{index + 1}</Text>

                <TextField
                  containerStyle={styles.stepField}
                  accessibilityLabel={`Procedure step ${index + 1}`}
                  placeholder="Describe this step"
                  value={step}
                  onChangeText={(text) => updateStep(index, text)}
                  multiline
                  numberOfLines={2}
                />

                <IconButton
                  icon="close"
                  accessibilityLabel={`Remove step ${index + 1}`}
                  onPress={() => removeStep(index)}
                />
              </View>
            ))}

            <View>
              <SecondaryButton
                title="Add Procedure Step"
                size="sm"
                icon="add"
                fullWidth={false}
                onPress={() => setField('procedure', [...values.procedure, ''])}
              />
            </View>
          </Card>
        </View>

        <View>
          <SectionTitle
            title="Constants"
            caption="Fixed values used in the calculations. The Variable Key is how formulas reference it."
          />

          <ItemListEditor
            items={values.constants}
            onChange={(items) => setField('constants', items)}
            fields={CONSTANT_FIELDS}
            addLabel="Add Constant"
            emptyText="No constants added yet."
            summarize={(item: ListItem) => ({
              title: item.name || item.key,
              meta: [item.value, item.unit].filter(Boolean).join(' '),
              lines: item.key ? [`key: ${item.key}`] : ['⚠ missing variable key'],
              monoLines: true,
            })}
          />
        </View>

        <View>
          <SectionTitle
            title="Inputs"
            caption="Values the student enters once, before any run. The Variable Key is how formulas reference it."
          />

          <ItemListEditor
            items={values.inputs}
            onChange={(items) => setField('inputs', items)}
            fields={FIELD_FIELDS}
            addLabel="Add Input"
            emptyText="No inputs added yet."
            summarize={(item: ListItem) => ({
              title: item.label || item.key,
              meta: item.units,
              lines: item.key ? [`key: ${item.key}`] : ['⚠ missing variable key'],
              monoLines: true,
            })}
          />
        </View>

        <View>
          <SectionTitle
            title="Run Fields"
            caption="Values the student measures for every run, on top of the inputs above."
          />

          <ItemListEditor
            items={values.runFields}
            onChange={(items) => setField('runFields', items)}
            fields={FIELD_FIELDS}
            addLabel="Add Run Field"
            emptyText="No run fields added yet."
            summarize={(item: ListItem) => ({
              title: item.label || item.key,
              meta: item.units,
              lines: item.key ? [`key: ${item.key}`] : ['⚠ missing variable key'],
              monoLines: true,
            })}
          />
        </View>

        <View>
          <SectionTitle
            title="Formulas"
            caption="Applied in order. The Calculation Expression is what actually runs; the Display Formula is only shown to the student."
          />

          <ItemListEditor
            items={values.formulas}
            onChange={(items) => setField('formulas', items)}
            fields={FORMULA_FIELDS}
            addLabel="Add Formula"
            emptyText="No formulas added yet."
            summarize={(item: ListItem) => ({
              title: item.name || item.key,
              lines: [
                item.key ? `key: ${item.key}` : '⚠ missing variable key',
                item.expression ? `= ${item.expression}` : '⚠ missing calculation expression',
                ...(item._checks ? ['has domain checks (preserved, not editable here)'] : []),
              ],
              monoLines: true,
            })}
          />
        </View>

        <View>
          <SectionTitle
            title="Outputs"
            caption="What the student sees after a run. Each Variable Key must match a formula or field key."
          />

          <ItemListEditor
            items={values.outputs}
            onChange={(items) => setField('outputs', items)}
            fields={OUTPUT_FIELDS}
            addLabel="Add Output"
            emptyText="No outputs added yet — every calculated value will be shown instead."
            summarize={(item: ListItem) => ({
              title: item.label || item.key,
              meta: item.unit,
              lines: item.key ? [`key: ${item.key}`] : ['⚠ missing variable key'],
              monoLines: true,
            })}
          />
        </View>

        <View>
          <SectionTitle
            title="Graphs"
            caption="X/Y Variable Keys pick which calculated values are plotted."
          />

          <ItemListEditor
            items={values.graphs}
            onChange={(items) => setField('graphs', items)}
            fields={GRAPH_FIELDS}
            addLabel="Add Graph"
            emptyText="No graphs added yet."
            summarize={(item: ListItem) => {
              const hasSeries = Boolean(item._series);
              const hasPlot = Boolean(item.xKey && item.yKey) || hasSeries;

              return {
                title: item.title,
                lines: [
                  hasPlot
                    ? item.xKey && item.yKey
                      ? `${item.xKey} → ${item.yKey}`
                      : 'multi-series (preserved, not editable here)'
                    : '⚠ no X/Y key set — this graph will not plot anything',
                ],
                monoLines: true,
              };
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },
  callout: {
    gap: spacing.sm,
  },
  calloutText: {
    ...typography.body,
    color: colors.text.strong,
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
  fields: {
    gap: input.fieldGap,
  },
  steps: {
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepNumber: {
    ...typography.label,
    color: colors.primary.default,
    width: spacing.xl,
    paddingTop: spacing.md,
  },
  stepField: {
    flex: 1,
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
});
