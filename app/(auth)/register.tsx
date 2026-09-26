import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { PasswordField } from '@/components/auth/PasswordField';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  elevation,
  input,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

import { mapAuthError } from '../../services/auth/authErrors';
import {
  hasErrors,
  PASSWORD_MIN_LENGTH,
  validateSignUp,
  type FieldErrors,
  type SignUpInput,
} from '../../services/auth/authValidation';

function goToLogin() {
  if (router.canGoBack()) router.back();
  else router.replace('/(auth)/login');
}

export default function RegisterScreen() {
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignUpInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateAccount() {
    if (submitting) return;

    const errors = validateSignUp({ name, email, password, confirmPassword });

    setFieldErrors(errors);
    setFormError(null);

    if (hasErrors(errors)) return;

    setSubmitting(true);

    try {
      // Registration is always for a student: the role is not something this form can choose.
      await signUp(email, password, { name });
      // Firebase signs the new account in, so nothing else is needed here: the root layout
      // reacts to the new auth state and opens the student area.
    } catch (error) {
      const authError = mapAuthError(error);

      if (authError.code === 'validation') {
        setFieldErrors((authError.fieldErrors ?? {}) as FieldErrors<SignUpInput>);
      } else if (authError.code === 'email-in-use') {
        setFieldErrors({ email: authError.message });
      } else if (authError.code === 'weak-password') {
        setFieldErrors({ password: authError.message });
      } else if (authError.code === 'invalid-email') {
        setFieldErrors({ email: authError.message });
      } else {
        setFormError(authError.message);
      }

      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={PUSHED_EDGES} maxWidth={layout.authMaxWidth}>
        <ScreenHeader
          variant="pushed"
          title="Create Account"
          subtitle="Join Flow Labs as a student."
          onBack={goToLogin}
        />

        <Card variant="elevated" padding="hero" style={styles.card}>
          <View style={styles.form}>
            <TextField
              label="Name"
              icon="person-outline"
              placeholder="Enter your full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              disabled={submitting}
              error={fieldErrors.name}
            />

            <TextField
              label="Email"
              icon="mail-outline"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              disabled={submitting}
              error={fieldErrors.email}
            />

            <PasswordField
              label="Password"
              placeholder="Create a password"
              helperText={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
              value={password}
              onChangeText={setPassword}
              autoComplete="new-password"
              disabled={submitting}
              error={fieldErrors.password}
            />

            <PasswordField
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleCreateAccount}
              disabled={submitting}
              error={fieldErrors.confirmPassword}
            />

            {formError ? <AuthErrorBanner message={formError} /> : null}

            <PrimaryButton
              title="Create Account"
              size="lg"
              loading={submitting}
              onPress={handleCreateAccount}
            />
          </View>
        </Card>

        <View style={styles.signIn}>
          <Text style={styles.signInText}>Already have an account?</Text>

          <SecondaryButton
            title="Sign In"
            disabled={submitting}
            onPress={goToLogin}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg.page,
  },
  card: {
    borderRadius: radius.xl,
    ...elevation.e2,
  },
  form: {
    gap: input.fieldGap,
  },
  signIn: {
    gap: spacing.md,
    marginTop: layout.sectionGap,
  },
  signInText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
