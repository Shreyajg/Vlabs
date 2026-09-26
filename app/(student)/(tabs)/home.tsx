import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import {
  colors,
  elevation,
  iconSizes,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import { resolveDisplayName } from '../../../services/auth/userProfile';
import { getCurrentUserId } from '../../../services/authService';
import { getStudentExperimentRuns } from '../../../services/experimentRunService';
import { getExperiments } from '../../../services/experimentService';
import { summarizeProgressBySubject, type SubjectProgress } from '../../../services/reportService';
import { getSubjects } from '../../../services/subjectService';

const ACTIONS = [
  {
    icon: 'library-outline',
    tone: 'primary',
    title: 'Browse Subjects',
    description: 'Explore available virtual laboratories',
    onPress: () => router.push('/(student)/(tabs)/subjects'),
  },
  {
    icon: 'sparkles-outline',
    tone: 'neutral',
    title: 'AI Lab Assistant',
    description: 'Get help understanding your experiments',
    onPress: () => router.push('/(student)/(tabs)/ai'),
  },
  {
    icon: 'analytics-outline',
    tone: 'mint',
    title: 'View Reports',
    description: 'Review your experiment performance',
    onPress: () => router.push('/(student)/(tabs)/reports'),
  },
] as const;

type ProgressStatus = 'loading' | 'ready' | 'signedOut' | 'error';

export default function HomeScreen() {
  // The name comes from the profile already in the shared auth state: no extra Firestore request.
  const { profile, user } = useAuth();

  const [progressStatus, setProgressStatus] = useState<ProgressStatus>('loading');
  const [progress, setProgress] = useState<SubjectProgress[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProgressStatus('loading');

      const studentId = getCurrentUserId();

      if (!studentId) {
        if (!cancelled) setProgressStatus('signedOut');
        return;
      }

      try {
        const subjects = await getSubjects();

        // Each subject's PUBLISHED experiments (getExperiments is published-only by Firestore rule),
        // the same call the Subject screen itself makes, just run once per subject up front here.
        const [experimentLists, runs] = await Promise.all([
          Promise.all(subjects.map((subject) => getExperiments(subject.id))),
          getStudentExperimentRuns(studentId),
        ]);

        if (cancelled) return;

        const experimentIdsBySubject = new Map(
          subjects.map((subject, index) => [subject.id, experimentLists[index]]),
        );

        setProgress(summarizeProgressBySubject(subjects, experimentIdsBySubject, runs));
        setProgressStatus('ready');
      } catch (err) {
        console.error('Failed to load subject progress:', err);

        if (!cancelled) setProgressStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retryProgress() {
    setAttempt((count) => count + 1);
  }

  const totals = progress.reduce(
    (sum, subject) => ({ completed: sum.completed + subject.completed, total: sum.total + subject.total }),
    { completed: 0, total: 0 },
  );

  return (
    <Screen>
      {/* Header */}
      <ScreenHeader
        title={resolveDisplayName(profile, user)}
        subtitle="Welcome back to your laboratory."
        action={{
          icon: 'person',
          onPress: () => router.push('/(student)/(tabs)/profile'),
          accessibilityLabel: 'Open profile',
        }}
      />

      <View style={styles.sections}>
        {/* Welcome Card */}
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Ready to explore?</Text>

            <Text style={styles.heroDescription}>
              Run virtual experiments, analyze your results and learn
              interactively.
            </Text>

            <SecondaryButton
              title="Explore Laboratories"
              size="sm"
              icon="arrow-forward"
              iconPosition="right"
              fullWidth={false}
              style={styles.heroButton}
              onPress={() => router.push('/(student)/(tabs)/subjects')}
            />
          </View>

          <View style={styles.heroArt}>
            <Ionicons
              name="flask"
              size={iconSizes.hero}
              color={colors.primary.default}
            />
          </View>
        </View>

        {/* Progress by subject */}
        <View>
          <SectionTitle
            title="Your Progress"
            caption={progressStatus === 'ready' && totals.total > 0 ? `${totals.completed} of ${totals.total} experiments completed` : undefined}
          />

          {progressStatus === 'loading' ? (
            <StateView variant="loading" fill={false} message="Loading your progress..." />
          ) : progressStatus === 'signedOut' ? (
            <StateView
              variant="empty"
              fill={false}
              icon="log-in-outline"
              title="Sign in to see your progress"
              message="Your progress is tied to your account."
            />
          ) : progressStatus === 'error' ? (
            <StateView
              variant="error"
              fill={false}
              message="We could not load your progress. Check your connection and try again."
              onAction={retryProgress}
            />
          ) : progress.length === 0 ? (
            <StateView
              variant="empty"
              fill={false}
              icon="library-outline"
              title="No subjects yet"
              message="Subjects will appear here once they are added."
            />
          ) : (
            <View style={styles.progressList}>
              {progress.map((subject) => (
                <Card key={subject.subjectId} style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <IconTile icon="flask-outline" tone="mint" size="sm" />

                    <View style={styles.progressText}>
                      <Text style={styles.progressTitle}>{subject.title}</Text>

                      <Text style={styles.progressCaption}>
                        {subject.total === 0
                          ? 'No published experiments yet'
                          : `${subject.completed} / ${subject.total} experiments completed`}
                      </Text>
                    </View>
                  </View>

                  {subject.total > 0 ? (
                    <ProgressBar value={(subject.completed / subject.total) * 100} />
                  ) : null}
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View>
          <SectionTitle title="Quick Actions" />

          <View style={styles.actions}>
            {ACTIONS.map((action) => (
              <Card
                key={action.title}
                onPress={action.onPress}
                style={styles.actionCard}
              >
                <IconTile icon={action.icon} tone={action.tone} />

                <View style={styles.actionText}>
                  <Text style={styles.actionTitle}>{action.title}</Text>

                  <Text style={styles.actionDescription}>
                    {action.description}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={iconSizes.control}
                  color={colors.ui.chevron}
                />
              </Card>
            ))}
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

  hero: {
    backgroundColor: colors.primary.default,
    borderRadius: radius.xl,
    padding: layout.cardPadding.hero,
    flexDirection: 'row',
    alignItems: 'center',
    ...elevation.e1,
  },
  heroText: {
    flex: 1,
    marginRight: spacing.lg,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.text.onPrimary,
  },
  heroDescription: {
    ...typography.body,
    color: colors.text.onPrimary,
    marginTop: spacing.sm,
  },
  heroButton: {
    marginTop: spacing.lg,
    borderColor: colors.bg.surface,
  },
  heroArt: {
    width: iconSizes.hero * 2,
    height: iconSizes.hero * 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressList: {
    gap: layout.cardGap,
  },
  progressCard: {
    gap: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  progressText: {
    flex: 1,
  },
  progressTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  progressCaption: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  actions: {
    gap: layout.cardGap,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  actionTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  actionDescription: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
