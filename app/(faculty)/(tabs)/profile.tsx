import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import {
  button,
  buttonSizes,
  colors,
  iconSizes,
  layout,
  radius,
  spacing,
  stateView,
  typography,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import { academicValue } from '../../../services/auth/userProfile';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function FacultyProfile() {
  const { user, profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const name = profile?.name || user?.displayName || 'Faculty';
  const email = profile?.email || user?.email || '';

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
      <ScreenHeader title="Profile" />

      <View style={styles.sections}>
        <Card padding="feature" style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>

          <Text style={styles.name}>{name}</Text>

          <Text style={styles.email}>{email}</Text>

          <Badge label="Faculty" tone="published" icon="people-outline" />

          <SecondaryButton
            title="Edit Profile"
            icon="create-outline"
            size="sm"
            fullWidth={false}
            onPress={() => router.push('/(faculty)/edit-profile')}
            style={styles.editButton}
          />
        </Card>

        <View>
          <SectionTitle title="Academic Information" />

          <Card>
            <InfoRow
              icon="school-outline"
              label="Department"
              value={academicValue(profile?.department)}
              empty={!profile?.department}
            />

            <InfoRow
              icon="business-outline"
              label="Institution"
              value={academicValue(profile?.university)}
              empty={!profile?.university}
              divided
            />
          </Card>
        </View>

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
  /** True when nothing has been added yet, so the "Not added" text is shown muted. */
  empty?: boolean;
  divided?: boolean;
}) {
  return (
    <View style={[styles.infoRow, divided && styles.infoDivider]}>
      <IconTile icon={icon} tone="mint" size="sm" />

      <View style={styles.rowText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, empty && styles.infoValueEmpty]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },

  profileCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: stateView.circleSize,
    height: stateView.circleSize,
    borderRadius: radius.full,
    backgroundColor: colors.mint[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h2,
    color: colors.teal.default,
  },
  name: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  email: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoDivider: {
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
  editButton: {
    marginTop: spacing.xs,
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
