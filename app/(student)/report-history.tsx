import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import { badge, chips, colors, layout, spacing, typography } from '@/constants/theme';
import { useExperimentTitles } from '@/hooks/use-experiment-titles';

import { getCurrentUserId } from '../../services/authService';
import { getStudentExperimentRuns } from '../../services/experimentRunService';
import {
  distinctExperimentRefs,
  experimentRefKey,
  filterRunsByExperiment,
  formatRunTimestamp,
  type ExperimentRef,
} from '../../services/reportService';
import type { ExperimentRun } from '../../types/ExperimentRun';

type Status = 'loading' | 'ready' | 'signedOut' | 'error';

export default function ReportHistory() {
  const [status, setStatus] = useState<Status>('loading');
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ExperimentRef | null>(null);
  const titles = useExperimentTitles(runs);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');

      const studentId = getCurrentUserId();

      if (!studentId) {
        if (!cancelled) setStatus('signedOut');
        return;
      }

      try {
        const savedRuns = await getStudentExperimentRuns(studentId);

        if (cancelled) return;

        setRuns(savedRuns);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load saved runs:', err);

        if (!cancelled) setStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // The experiment filter is scoped to what the student has actually saved runs for; clear it if that
  // set changes (a retry, or simply no longer matching anything) rather than silently filtering to nothing.
  useEffect(() => {
    if (!selected) return;

    const stillPresent = runs.some((run) => run.experimentId === selected.experimentId);

    if (!stillPresent) setSelected(null);
  }, [runs, selected]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  function titleFor(ref: ExperimentRef): string {
    return titles.get(experimentRefKey(ref)) ?? ref.experimentId;
  }

  if (status === 'loading') {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Run History" />
        <StateView variant="loading" message="Loading your saved runs..." />
      </Screen>
    );
  }

  if (status === 'signedOut') {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Run History" />
        <StateView
          variant="empty"
          icon="log-in-outline"
          title="Sign in to see your reports"
          message="Your saved runs are tied to your account."
        />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Run History" />
        <StateView
          variant="error"
          message="We could not load your saved runs. Check your connection and try again."
          onAction={retry}
        />
      </Screen>
    );
  }

  if (runs.length === 0) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <ScreenHeader variant="pushed" title="Run History" />
        <StateView
          variant="empty"
          icon="document-text-outline"
          title="No saved runs yet"
          message="Calculate and save a run from any experiment and it will appear here."
        />
      </Screen>
    );
  }

  const experimentRefs = distinctExperimentRefs(runs);
  const visibleRuns = filterRunsByExperiment(runs, selected?.experimentId ?? null);

  return (
    <Screen edges={PUSHED_EDGES}>
      <ScreenHeader variant="pushed" title="Run History" subtitle={`${runs.length} saved runs`} />

      <View style={styles.sections}>
        {experimentRefs.length > 1 ? (
          <View>
            <SectionTitle title="Filter by Experiment" />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <FilterChip label="All" active={selected === null} onPress={() => setSelected(null)} />

              {experimentRefs.map((ref) => (
                <FilterChip
                  key={experimentRefKey(ref)}
                  label={titleFor(ref)}
                  active={selected !== null && experimentRefKey(selected) === experimentRefKey(ref)}
                  onPress={() => setSelected(ref)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {selected ? (
          <SecondaryButton
            title={`View Analytics for ${titleFor(selected)}`}
            icon="analytics-outline"
            onPress={() =>
              router.push({
                pathname: '/(student)/analytics/[subjectId]/[experimentId]',
                params: { subjectId: selected.subjectId, experimentId: selected.experimentId },
              })
            }
          />
        ) : null}

        <View>
          <SectionTitle
            title="Saved Runs"
            caption={selected ? `${visibleRuns.length} of ${runs.length} runs` : undefined}
            spacedTop
          />

          {visibleRuns.length === 0 ? (
            <StateView
              variant="empty"
              fill={false}
              icon="filter-outline"
              title="No runs for this experiment"
              message="Choose a different experiment, or select All."
            />
          ) : (
            <View style={styles.list}>
              {visibleRuns.map((run) => (
                <Card
                  key={run.id}
                  style={styles.row}
                  onPress={() =>
                    router.push({
                      pathname: '/(student)/run-detail/[runId]',
                      params: { runId: run.id },
                    })
                  }
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{titleFor(run)}</Text>

                    <Text style={styles.rowCaption}>
                      {run.subjectId} · {formatRunTimestamp(run.completedAt)}
                    </Text>

                    <Text style={styles.rowResults}>
                      {Object.keys(run.results).length > 0
                        ? `${Object.keys(run.results).length} calculated results`
                        : 'No results recorded'}
                    </Text>
                  </View>

                  <Badge label="Saved" tone="published" icon="cloud-done-outline" />
                </Card>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tone = active ? chips.info : chips.neutral;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, { backgroundColor: tone.bg }]}
    >
      <Text style={[styles.chipLabel, { color: tone.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },
  list: {
    gap: layout.cardGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  rowCaption: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  rowResults: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    height: badge.height + spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: (badge.height + spacing.xs) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 200,
  },
  chipLabel: {
    ...typography.badge,
  },
});
