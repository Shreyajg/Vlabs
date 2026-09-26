import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import { StatGrid } from '@/components/ui/StatCard';
import { colors, layout, spacing, typography } from '@/constants/theme';
import { useExperimentTitles } from '@/hooks/use-experiment-titles';

import { getCurrentUserId } from '../../../services/authService';
import { getStudentExperimentRuns } from '../../../services/experimentRunService';
import { experimentRefKey, formatRunTimestamp, summarizeRuns } from '../../../services/reportService';
import type { ExperimentRun } from '../../../types/ExperimentRun';

type Status = 'loading' | 'ready' | 'signedOut' | 'error';

const RECENT_COUNT = 5;

export default function StudentReports() {
  const [status, setStatus] = useState<Status>('loading');
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [attempt, setAttempt] = useState(0);
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

  function retry() {
    setAttempt((count) => count + 1);
  }

  function titleFor(run: ExperimentRun): string {
    return titles.get(experimentRefKey(run)) ?? run.experimentId;
  }

  if (status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title="My Reports" subtitle="Your laboratory performance" />
        <StateView variant="loading" message="Loading your saved runs..." />
      </Screen>
    );
  }

  if (status === 'signedOut') {
    return (
      <Screen>
        <ScreenHeader title="My Reports" subtitle="Your laboratory performance" />
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
      <Screen>
        <ScreenHeader title="My Reports" subtitle="Your laboratory performance" />
        <StateView
          variant="error"
          message="We could not load your saved runs. Check your connection and try again."
          onAction={retry}
        />
      </Screen>
    );
  }

  const summary = summarizeRuns(runs, RECENT_COUNT);

  return (
    <Screen>
      <ScreenHeader title="My Reports" subtitle="Your laboratory performance" />

      <View style={styles.sections}>
        {runs.length === 0 ? (
          <StateView
            variant="empty"
            fill={false}
            icon="flask-outline"
            title="No saved runs yet"
            message="Calculate and save a run and it will appear here."
            actionLabel="Browse Subjects"
            onAction={() => router.push('/(student)/(tabs)/subjects')}
          />
        ) : (
          <>
            <StatGrid
              stats={[
                {
                  icon: 'flask-outline',
                  tone: 'mint',
                  value: String(summary.experimentsCompleted),
                  label: 'Experiments Completed',
                },
                {
                  icon: 'save-outline',
                  tone: 'mint',
                  value: String(summary.totalRuns),
                  label: 'Total Runs Saved',
                },
              ]}
            />

            <View>
              <SectionTitle title="Recent Runs" spacedTop />

              <View style={styles.list}>
                {summary.recentRuns.map((run) => (
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

                      <Text style={styles.rowCaption}>{formatRunTimestamp(run.completedAt)}</Text>
                    </View>

                    <Badge label="Saved" tone="published" icon="cloud-done-outline" />
                  </Card>
                ))}
              </View>
            </View>

            <SecondaryButton
              title="View All Reports"
              icon="arrow-forward"
              iconPosition="right"
              onPress={() => router.push('/(student)/report-history')}
            />
          </>
        )}
      </View>
    </Screen>
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
});
