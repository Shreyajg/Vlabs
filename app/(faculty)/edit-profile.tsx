import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { SuccessBanner } from '@/components/auth/SuccessBanner';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { TextField } from '@/components/ui/TextField';
import { colors, input, layout, spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import { mapAuthError } from '../../services/auth/authErrors';
import {
  hasErrors,
  validateFacultyProfileEdit,
  type FacultyProfileEditInput,
  type FieldErrors,
} from '../../services/auth/authValidation';

/** How long the confirmation stays visible before returning to the profile. */
const SUCCESS_DELAY_MS = 900;

export default function FacultyEditProfileScreen() {
  const { user, profile, updateProfile } = useAuth();

  const saved: FacultyProfileEditInput = {
    name: profile?.name ?? '',
    university: profile?.university ?? '',
    department: profile?.department ?? '',
  };

  const [name, setName] = useState(saved.name);
  const [department, setDepartment] = useState(saved.department);
  const [university, setUniversity] = useState(saved.university);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<FacultyProfileEditInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving the screen early (Cancel, browser back) must not fire a second "back" later.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const changed =
    name.trim() !== saved.name ||
    department.trim() !== saved.department ||
    university.trim() !== saved.university;

  async function handleSave() {
    if (saving || done || !changed) return;

    const values = { name, university, department };
    const errors = validateFacultyProfileEdit(values);

    setFieldErrors(errors);
    setFormError(null);

    if (hasErrors(errors)) return;

    setSaving(true);

    try {
      // Saves to users/{uid} and updates the shared profile state, so the Profile screen shows the
      // new values the moment we go back to it.
      await updateProfile(values);

      setSaving(false);
      setDone(true);
      closeTimer.current = setTimeout(() => router.back(), SUCCESS_DELAY_MS);
    } catch (error) {
      const authError = mapAuthError(error);

      if (authError.code === 'validation') {
        setFieldErrors((authError.fieldErrors ?? {}) as FieldErrors<FacultyProfileEditInput>);
      } else {
        setFormError(authError.message);
      }

      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        edges={PUSHED_EDGES}
        maxWidth={layout.authMaxWidth}
        footer={
          <View style={styles.footer}>
            <View style={styles.footerAction}>
              <SecondaryButton
                title="Cancel"
                disabled={saving}
                onPress={() => router.back()}
              />
            </View>

            <View style={styles.footerAction}>
              <PrimaryButton
                title="Save Changes"
                icon="checkmark"
                loading={saving}
                disabled={!changed || done}
                onPress={handleSave}
              />
            </View>
          </View>
        }
      >
        <ScreenHeader
          variant="pushed"
          title="Edit Profile"
          subtitle="Update your details."
        />

        <Card padding="feature" style={styles.fields}>
          <TextField
            label="Name"
            icon="person-outline"
            placeholder="Enter your full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            disabled={saving || done}
            error={fieldErrors.name}
          />

          {/* The email is the Firebase sign-in identity, so it is shown but not editable. */}
          <TextField
            label="Email"
            icon="mail-outline"
            value={profile?.email || user?.email || ''}
            disabled
            helperText="Your email is tied to your sign-in and cannot be changed here."
          />

          <TextField
            label="Department"
            icon="school-outline"
            placeholder="Enter your department"
            value={department}
            onChangeText={setDepartment}
            autoCapitalize="words"
            disabled={saving || done}
            error={fieldErrors.department}
          />

          <TextField
            label="Institution"
            icon="business-outline"
            placeholder="Enter your university or institution"
            value={university}
            onChangeText={setUniversity}
            autoCapitalize="words"
            disabled={saving || done}
            error={fieldErrors.university}
          />

          {formError ? <AuthErrorBanner message={formError} /> : null}

          {done ? <SuccessBanner message="Profile updated." /> : null}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg.page,
  },
  fields: {
    gap: input.fieldGap,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerAction: {
    flex: 1,
  },
});
