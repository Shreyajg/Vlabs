import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
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

import { getExperimentRuns } from '../../../services/experimentRunService';
import { getAllExperiments } from '../../../services/experimentService';
import {
  experimentRefKey,
  formatRunTimestamp,
  publishedExperimentRefs,
  summarizeStudentPerformance,
  type StudentPerformance,
} from '../../../services/reportService';
import { getStudentProfiles } from '../../../services/userService';
import { getSubjects } from '../../../services/subjectService';
import type { ExperimentRun } from '../../../types/ExperimentRun';
import type { NormalizedExperiment } from '../../../types/Experiment';

type Status = 'loading' | 'ready' | 'error';

interface ReportData {
  subjectsCount: number;
  experimentsCount: number;
  studentsCount: number;
  runs: ExperimentRun[];
  performance: StudentPerformance[];
  experimentTitleByRef: Map<string, string>;
}

const RECENT_ACTIVITY_COUNT = 6;

export default function FacultyReports() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<ReportData | null>(null);
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
        const published = publishedExperimentRefs(
          allExperiments.map((experiment) => ({
            subjectId: experiment.subjectId,
            id: experiment.id,
            isPublished: experiment.isPublished,
          })),
        );

        setData({
          subjectsCount: subjects.length,
          experimentsCount: allExperiments.length,
          studentsCount: students.length,
          runs,
          performance: summarizeStudentPerformance(
            students.map((student) => ({ uid: student.uid, name: student.name })),
            published,
            runs,
          ),
          experimentTitleByRef: new Map(
            allExperiments.map((experiment) => [
              experimentRefKey({ subjectId: experiment.subjectId, experimentId: experiment.id }),
              experiment.title,
            ]),
          ),
        });
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load reports:', err);

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
        title="Reports"
        subtitle="See how your lab is being used"
      />

      {status === 'loading' ? (
        <StateView variant="loading" message="Loading your reports..." />
      ) : status === 'error' ? (
        <StateView
          variant="error"
          message="We could not load your reports. Check your connection and try again."
          onAction={retry}
        />
      ) : data ? (
        <View style={styles.sections}>
          <View>
            <SectionTitle title="Your Lab in Numbers" />

            <StatGrid
              stats={[
                {
                  icon: 'people-outline',
                  tone: 'mint',
                  value: String(data.studentsCount),
                  label: 'Students',
                },
                {
                  icon: 'play-circle-outline',
                  tone: 'primary',
                  value: String(data.runs.length),
                  label: 'Lab Runs',
                },
                {
                  icon: 'library-outline',
                  tone: 'primary',
                  value: String(data.subjectsCount),
                  label: 'Subjects',
                },
                {
                  icon: 'flask-outline',
                  tone: 'mint',
                  value: String(data.experimentsCount),
                  label: 'Experiments',
                },
              ]}
            />
          </View>

          <View>
            <SectionTitle
              title="Student Progress"
              caption="Distinct published experiments each student has completed."
            />

            {data.performance.length === 0 ? (
              <StateView
                variant="empty"
                fill={false}
                icon="people-outline"
                title="No students yet"
                message="Student progress will appear here once students have accounts."
              />
            ) : (
              <Card padding="feature" style={styles.performance}>
                {data.performance.map((student) => {
                  const percent = student.total === 0 ? 0 : Math.round((student.completed / student.total) * 100);

                  return (
                    <View key={student.studentId} style={styles.student}>
                      <View style={styles.studentHeader}>
                        <Text style={styles.studentName}>{student.name || 'Unnamed student'}</Text>
                        <Text style={styles.studentPercent}>{percent}%</Text>
                      </View>

                      <Text style={styles.studentCount}>
                        {student.total === 0
                          ? 'No published experiments yet'
                          : `${student.completed} / ${student.total} experiments`}
                      </Text>

                      {student.total > 0 ? <ProgressBar value={percent} /> : null}
                    </View>
                  );
                })}
              </Card>
            )}
          </View>

          <View>
            <SectionTitle title="Lab Activity" caption="What's been run most recently." />

            {data.runs.length === 0 ? (
              <StateView
                variant="empty"
                fill={false}
                icon="pulse-outline"
                title="No lab activity yet"
                message="Saved runs from your students will show up here."
              />
            ) : (
              <Card padding={0} style={styles.activityCard}>
                {data.runs.slice(0, RECENT_ACTIVITY_COUNT).map((activity, index) => {
                  const experimentTitle =
                    data.experimentTitleByRef.get(
                      experimentRefKey({ subjectId: activity.subjectId, experimentId: activity.experimentId }),
                    ) ?? activity.experimentId;

                  return (
                    <View
                      key={activity.id}
                      style={[styles.activityRow, index > 0 && styles.rowDivider]}
                    >
                      <View style={styles.activityText}>
                        <Text style={styles.activityTitle}>{experimentTitle}</Text>

                        <Text style={styles.activityMeta}>
                          {formatRunTimestamp(activity.completedAt)}
                        </Text>
                      </View>

                      <Badge label="Completed" tone="success" />
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },

  performance: {
    gap: layout.sectionGap,
  },
  student: {
    gap: spacing.sm,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentName: {
    ...typography.label,
    color: colors.text.primary,
  },
  studentPercent: {
    ...typography.label,
    color: colors.teal.default,
  },
  studentCount: {
    ...typography.caption,
    color: colors.text.secondary,
  },

  activityCard: {
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: layout.cardPadding.compact,
  },
  rowDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
  },
  activityText: {
    flex: 1,
  },
  activityTitle: {
    ...typography.label,
    color: colors.text.primary,
  },
  activityMeta: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
