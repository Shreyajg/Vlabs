import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { PasswordField } from '@/components/auth/PasswordField';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PUSHED_EDGES, Screen } from '@/components/ui/Screen';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  elevation,
  iconSizes,
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
  validateSignIn,
  type FieldErrors,
  type SignInInput,
} from '../../services/auth/authValidation';

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignInInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    if (submitting) return;

    const errors = validateSignIn({ email, password });

    setFieldErrors(errors);
    setFormError(null);

    if (hasErrors(errors)) return;

    setSubmitting(true);

    try {
      await signIn(email, password);
      // Success needs no navigation here: the root layout reacts to the new auth state
      // and moves the user to the right area for their role.
    } catch (error) {
      const authError = mapAuthError(error);

      if (authError.code === 'validation') {
        setFieldErrors(authError.fieldErrors ?? {});
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
      <Screen
        edges={PUSHED_EDGES}
        maxWidth={layout.authMaxWidth}
        contentStyle={styles.center}
      >
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons
              name="flask"
              size={iconSizes.empty}
              color={colors.text.onPrimary}
            />
          </View>

          <Text style={styles.appName}>Flow Labs</Text>

          <Text style={styles.tagline}>Interactive virtual laboratories</Text>
        </View>

        {/* Login Card */}
        <Card variant="elevated" padding="hero" style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>

          <Text style={styles.subtitle}>
            Sign in to continue to your laboratory dashboard.
          </Text>

          <View style={styles.form}>
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
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
              disabled={submitting}
              error={fieldErrors.password}
            />

            {formError ? <AuthErrorBanner message={formError} /> : null}

            <PrimaryButton
              title="Sign In"
              size="lg"
              icon="arrow-forward"
              iconPosition="right"
              loading={submitting}
              onPress={handleSignIn}
            />
          </View>

          <View style={styles.register}>
            <Text style={styles.registerText}>Don&apos;t have an account?</Text>

            <SecondaryButton
              title="Create Account"
              disabled={submitting}
              onPress={() => router.push('/(auth)/register')}
            />
          </View>
        </Card>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Grant-Funded Virtual Laboratory Platform
          </Text>

          <Text style={styles.footerSubtext}>Learn • Simulate • Analyze</Text>
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
  center: {
    justifyContent: 'center',
  },

  brand: {
    alignItems: 'center',
    marginBottom: layout.sectionGap,
  },
  logo: {
    width: iconSizes.hero + spacing.xl,
    height: iconSizes.hero + spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.primary.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  appName: {
    ...typography.display,
    color: colors.text.primary,
  },
  tagline: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  card: {
    borderRadius: radius.xl,
    ...elevation.e2,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  form: {
    gap: input.fieldGap,
    marginTop: spacing['2xl'],
  },

  register: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
    paddingTop: spacing['2xl'],
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
  },
  registerText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  footer: {
    alignItems: 'center',
    marginTop: layout.sectionGap,
  },
  footerText: {
    ...typography.badge,
    color: colors.text.secondary,
  },
  footerSubtext: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
