import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, iconSizes, layout, radius, spacing, typography } from '@/constants/theme';

/** A form-level error, in the same red used elsewhere in the app. */
export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={iconSizes.banner} color={colors.error.solid} />

      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    borderColor: colors.error.border,
    backgroundColor: colors.error.bgSubtle,
  },
  text: {
    ...typography.body,
    color: colors.error.text,
    flex: 1,
  },
});
