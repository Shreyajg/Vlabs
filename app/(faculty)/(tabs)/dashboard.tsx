import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import { StatGrid } from '@/components/ui/StatCard';
import {
  colors,
  layout,
  spacing,
  typography,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import { resolveDisplayName } from '../../../services/auth/userProfile';
import { getExperimentRuns } from '../../../services/experimentRunService';
import { getAllExperiments } from '../../../services/experimentService';
import { experimentRefKey, formatRunTimestamp } from '../../../services/reportService';
import { getStudentProfiles } from '../../../services/userService';
import { getSubjects } from '../../../services/subjectService';
import type { ExperimentRun } from '../../../types/ExperimentRun';
import type { NormalizedExperiment } from '../../../types/Experiment';

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Status = 'loading' | 'ready' | 'error';

interface Overview {
  subjectsCount: number;
  experimentsCount: number;
  studentsCount: number;
  runs: ExperimentRun[];
  studentNameByUid: Map<string, string>;
  experimentTitleByRef: Map<string, string>;
}

const RECENT_ACTIVITY_COUNT = 5;

export default function FacultyDashboard() {
  const { profile, user } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');

      try {
        const subjects = await getSubjects();

        const [experimentLists, students, runs] = await Promise.all([
          Promise.all(subjects.map((subject) => getAllExperiments(subject.id))),
          getStudentProfiles(),
          getExperimentRuns(),
        ]);

        if (cancelled) return;

        const allExperiments: NormalizedExperiment[] = experimentLists.flat();

        setOverview({
          subjectsCount: subjects.length,
          experimentsCount: allExperiments.length,
          studentsCount: students.length,
          runs,
          studentNameByUid: new Map(students.map((student) => [student.uid, student.name])),
          experimentTitleByRef: new Map(
            allExperiments.map((experiment) => [
              experimentRefKey({ subjectId: experiment.subjectId, experimentId: experiment.id }),
              experiment.title,
            ]),
          ),
        });
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load the dashboard:', err);

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

  return (
    <Screen>
      <ScreenHeader
        title="Dashboard"
        subtitle="Your lab, at a glance"
        action={{
          icon: 'person',
          onPress: () => router.push('/(faculty)/(tabs)/profile'),
          accessibilityLabel: 'Open profile',
        }}
      />

      <View style={styles.sections}>
        <View>
          <Text style={styles.greeting}>
            {getGreeting()}, {resolveDisplayName(profile, user)}
          </Text>

          <Text style={styles.greetingText}>
            Here&apos;s what&apos;s happening in your labs.
          </Text>
        </View>

        {status === 'loading' ? (
          <StateView variant="loading" fill={false} message="Loading your lab..." />
        ) : status === 'error' ? (
          <StateView
            variant="error"
            fill={false}
            message="We could not load your lab data. Check your connection and try again."
            onAction={retry}
          />
        ) : overview ? (
          <>
            <View>
              <SectionTitle title="Your Lab at a Glance" />

              <StatGrid
                stats={[
                  {
                    icon: 'library-outline',
                    tone: 'primary',
                    value: String(overview.subjectsCount),
                    label: 'Subjects',
                  },
                  {
                    icon: 'flask-outline',
                    tone: 'mint',
                    value: String(overview.experimentsCount),
                    label: 'Experiments',
                  },
                  {
                    icon: 'people-outline',
                    tone: 'primary',
                    value: String(overview.studentsCount),
                    label: 'Students',
                  },
                  {
                    icon: 'play-circle-outline',
                    tone: 'neutral',
                    value: String(overview.runs.length),
                    label: 'Lab Runs',
                  },
                ]}
              />
            </View>

            <View>
              <SectionTitle title="Lab Activity" caption="What your students have been running." />

              {overview.runs.length === 0 ? (
                <StateView
                  variant="empty"
                  fill={false}
                  icon="pulse-outline"
                  title="No lab activity yet"
                  message="Saved runs from your students will show up here."
                />
              ) : (
                <Card padding={0} style={styles.activityCard}>
                  {overview.runs.slice(0, RECENT_ACTIVITY_COUNT).map((activity, index) => {
                    const studentName = overview.studentNameByUid.get(activity.studentId) ?? 'A student';
                    const experimentTitle =
                      overview.experimentTitleByRef.get(
                        experimentRefKey({ subjectId: activity.subjectId, experimentId: activity.experimentId }),
                      ) ?? activity.experimentId;

                    return (
                      <View
                        key={activity.id}
                        style={[styles.activityRow, index > 0 && styles.rowDivider]}
                      >
                        <IconTile icon="checkmark-circle-outline" tone="mint" size="sm" />

                        <View style={styles.activityText}>
                          <Text style={styles.activityTitle}>
                            {studentName} completed {experimentTitle}
                          </Text>

                          <Text style={styles.activityTime}>{formatRunTimestamp(activity.completedAt)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              )}
            </View>
          </>
        ) : null}

        <View>
          <SectionTitle title="Quick Actions" />

          <View style={styles.actions}>
            <Card
              onPress={() => router.push('/(faculty)/experiment/create')}
              style={styles.actionCard}
            >
              <IconTile icon="add" tone="primary" />

              <Text style={styles.actionTitle}>Create Experiment</Text>
            </Card>

            <Card
              onPress={() => router.push('/(faculty)/(tabs)/experiments')}
              style={styles.actionCard}
            >
              <IconTile icon="flask-outline" tone="mint" />

              <Text style={styles.actionTitle}>View Experiments</Text>
            </Card>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },

  greeting: {
    ...typography.h2,
    color: colors.text.primary,
  },
  greetingText: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  activityCard: {
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: layout.cardPadding.compact,
  },
  rowDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
  },
  activityText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  activityTitle: {
    ...typography.label,
    color: colors.text.primary,
  },
  activityTime: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  actions: {
    flexDirection: 'row',
    gap: layout.cardGap,
  },
  actionCard: {
    flex: 1,
    gap: spacing.md,
  },
  actionTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
});
