import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
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
  validateProfileEdit,
  type FieldErrors,
  type ProfileEditInput,
} from '../../services/auth/authValidation';

export default function EditProfileScreen() {
  const { user, profile, updateProfile } = useAuth();

  const saved: ProfileEditInput = {
    name: profile?.name ?? '',
    university: profile?.university ?? '',
    program: profile?.program ?? '',
    branch: profile?.branch ?? '',
  };

  const [name, setName] = useState(saved.name);
  const [university, setUniversity] = useState(saved.university);
  const [program, setProgram] = useState(saved.program);
  const [branch, setBranch] = useState(saved.branch);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ProfileEditInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed =
    name.trim() !== saved.name ||
    university.trim() !== saved.university ||
    program.trim() !== saved.program ||
    branch.trim() !== saved.branch;

  async function handleSave() {
    if (saving || !changed) return;

    const values = { name, university, program, branch };
    const errors = validateProfileEdit(values);

    setFieldErrors(errors);
    setFormError(null);

    if (hasErrors(errors)) return;

    setSaving(true);

    try {
      // Saves to users/{uid} and updates the shared profile state, so Home and Profile refresh together.
      await updateProfile(values);
      router.back();
    } catch (error) {
      const authError = mapAuthError(error);

      if (authError.code === 'validation') {
        setFieldErrors((authError.fieldErrors ?? {}) as FieldErrors<ProfileEditInput>);
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
                title="Save"
                icon="checkmark"
                loading={saving}
                disabled={!changed}
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
            disabled={saving}
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
            label="University"
            icon="school-outline"
            placeholder="Enter your university"
            value={university}
            onChangeText={setUniversity}
            autoCapitalize="words"
            disabled={saving}
            error={fieldErrors.university}
          />

          <TextField
            label="Program"
            icon="book-outline"
            placeholder="Enter your program"
            value={program}
            onChangeText={setProgram}
            autoCapitalize="words"
            disabled={saving}
            error={fieldErrors.program}
          />

          <TextField
            label="Branch"
            icon="layers-outline"
            placeholder="Enter your branch"
            value={branch}
            onChangeText={setBranch}
            autoCapitalize="words"
            disabled={saving}
            error={fieldErrors.branch}
          />

          {formError ? <AuthErrorBanner message={formError} /> : null}
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
