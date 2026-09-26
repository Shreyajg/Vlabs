import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { StateView } from '@/components/ui/StateView';
import {
  button,
  buttonSizes,
  colors,
  iconSizes,
  iconTile,
  layout,
  radius,
  spacing,
  stateView,
  typography,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import {
  academicValue,
  resolveDisplayName,
} from '../../../services/auth/userProfile';
import { getCurrentUserId } from '../../../services/authService';
import { getStudentExperimentRuns } from '../../../services/experimentRunService';
import { getExperiments } from '../../../services/experimentService';
import { summarizeProgressBySubject, summarizeRuns, type SubjectProgress } from '../../../services/reportService';
import { getSubjects } from '../../../services/subjectService';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Status = 'loading' | 'ready' | 'signedOut' | 'error';

interface Activity {
  /** Distinct PUBLISHED experiments (across every subject) the student has completed. */
  experimentsCompleted: number;
  /** Total saved experiment runs. */
  runsSaved: number;
  /** experimentsCompleted / total published experiments, 0-100. 0 when there is nothing published yet. */
  completionPercent: number;
  progress: SubjectProgress[];
}

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const [status, setStatus] = useState<Status>('loading');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [attempt, setAttempt] = useState(0);

  const name = resolveDisplayName(profile, user);
  const email = profile?.email || user?.email || '';

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
        const subjects = await getSubjects();

        // Same published-only, per-subject reads Home uses for subject progress, plus the student's
        // saved runs — so this screen reports the identical numbers Home and Reports already show.
        const [experimentLists, runs] = await Promise.all([
          Promise.all(subjects.map((subject) => getExperiments(subject.id))),
          getStudentExperimentRuns(studentId),
        ]);

        if (cancelled) return;

        const experimentIdsBySubject = new Map(
          subjects.map((subject, index) => [subject.id, experimentLists[index]]),
        );

        const progress = summarizeProgressBySubject(subjects, experimentIdsBySubject, runs);
        const totals = progress.reduce(
          (sum, subject) => ({
            completed: sum.completed + subject.completed,
            total: sum.total + subject.total,
          }),
          { completed: 0, total: 0 },
        );

        setActivity({
          experimentsCompleted: totals.completed,
          runsSaved: summarizeRuns(runs).totalRuns,
          completionPercent: totals.total === 0 ? 0 : Math.round((totals.completed / totals.total) * 100),
          progress,
        });
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load laboratory activity:', err);

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

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      // The root layout reacts to the new auth state and returns to the login screen.
      await signOut();
    } catch (error) {
      console.warn('Sign out failed:', error);
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      {/* Header */}
      <ScreenHeader title="Profile" />

      <View style={styles.sections}>
        {/* Profile Card */}
        <Card padding="feature" style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>

            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>

            <Badge label="Student" tone="info" icon="school-outline" />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.editButton,
              pressed && styles.editButtonPressed,
            ]}
            onPress={() => router.push('/(student)/edit-profile')}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <Ionicons
              name="create-outline"
              size={iconSizes.control}
              color={colors.primary.default}
            />
          </Pressable>
        </Card>

        {/* Academic Info */}
        <View>
          <SectionTitle title="Academic Information" />

          <Card>
            <InfoRow
              icon="school-outline"
              label="University"
              value={academicValue(profile?.university)}
              empty={!profile?.university}
            />

            <InfoRow
              icon="book-outline"
              label="Program"
              value={academicValue(profile?.program)}
              empty={!profile?.program}
              divided
            />

            <InfoRow
              icon="layers-outline"
              label="Branch"
              value={academicValue(profile?.branch)}
              empty={!profile?.branch}
              divided
            />
          </Card>
        </View>

        {/* Laboratory Activity */}
        <View>
          <SectionTitle title="Laboratory Activity" />

          {status === 'loading' ? (
            <StateView variant="loading" fill={false} message="Loading your activity..." />
          ) : status === 'signedOut' ? (
            <StateView
              variant="empty"
              fill={false}
              icon="log-in-outline"
              title="Sign in to see your activity"
              message="Your laboratory activity is tied to your account."
            />
          ) : status === 'error' ? (
            <StateView
              variant="error"
              fill={false}
              message="We could not load your activity. Check your connection and try again."
              onAction={retry}
            />
          ) : activity ? (
            <Card variant="mint" padding="feature" style={styles.statsCard}>
              <Stat value={String(activity.experimentsCompleted)} label="Experiments" />

              <View style={styles.divider} />

              <Stat value={String(activity.runsSaved)} label="Runs Saved" />

              <View style={styles.divider} />

              <Stat value={`${activity.completionPercent}%`} label="Completion" />
            </Card>
          ) : null}
        </View>

        {/* Subject-wise progress */}
        {status === 'ready' && activity && activity.progress.length > 0 ? (
          <View>
            <SectionTitle title="Progress by Subject" />

            <View style={styles.progressList}>
              {activity.progress.map((subject) => (
                <Card key={subject.subjectId} style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <IconTile icon="flask-outline" tone="mint" size="sm" />

                    <View style={styles.progressText}>
                      <Text style={styles.progressTitle}>{subject.title}</Text>

                      <Text style={styles.progressCaption}>
                        {subject.total === 0
                          ? 'No published experiments yet'
                          : `${subject.completed} / ${subject.total} experiments`}
                      </Text>
                    </View>

                    {subject.total > 0 ? (
                      <Text style={styles.progressPercent}>
                        {Math.round((subject.completed / subject.total) * 100)}%
                      </Text>
                    ) : null}
                  </View>

                  {subject.total > 0 ? (
                    <ProgressBar value={(subject.completed / subject.total) * 100} />
                  ) : null}
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {/* Sign Out */}
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.logoutButtonPressed,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityState={{ disabled: signingOut, busy: signingOut }}
        >
          <Ionicons
            name="log-out-outline"
            size={iconSizes.control}
            color={colors.error.text}
          />

          <Text style={styles.logoutText}>
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function InfoRow({
  icon,
  label,
  value,
  empty,
  divided,
}: {
  icon: IconName;
  label: string;
  value: string;
  empty?: boolean;
  divided?: boolean;
}) {
  return (
    <View style={[styles.infoRow, divided && styles.rowDivider]}>
      <IconTile icon={icon} tone="primary" size="sm" />

      <View style={styles.rowText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, empty && styles.infoValueEmpty]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: stateView.circleSize,
    height: stateView.circleSize,
    borderRadius: radius.full,
    backgroundColor: colors.primary.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h2,
    color: colors.primary.default,
  },
  profileInfo: {
    flex: 1,
    marginHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  name: {
    ...typography.h3,
    color: colors.text.primary,
  },
  email: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  editButton: {
    width: button.iconButtonSize,
    height: button.iconButtonSize,
    borderRadius: button.radius,
    backgroundColor: colors.primary.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonPressed: {
    backgroundColor: colors.ui.rowPressed,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  rowText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  infoValue: {
    ...typography.label,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  infoValueEmpty: {
    color: colors.text.secondary,
  },

  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    ...typography.stat,
    color: colors.primary.default,
  },
  statLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  divider: {
    width: layout.borderWidth,
    height: iconTile.sizes.sm,
    backgroundColor: colors.mint.border,
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
  progressPercent: {
    ...typography.label,
    color: colors.teal.default,
  },

  logoutButton: {
    height: buttonSizes.md.height,
    borderRadius: button.radius,
    borderWidth: layout.borderWidth,
    borderColor: colors.error.border,
    backgroundColor: colors.error.bgSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: buttonSizes.md.gap,
  },
  logoutButtonPressed: {
    backgroundColor: colors.error.bg,
  },
  logoutText: {
    ...typography.button,
    color: colors.error.text,
  },
});
