import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, iconSizes, layout, radius, spacing, typography } from '@/constants/theme';

/** A form-level confirmation, the counterpart of AuthErrorBanner, in the app's success green. */
export function SuccessBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="checkmark-circle" size={iconSizes.banner} color={colors.success.solid} />

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
    borderColor: colors.success.border,
    backgroundColor: colors.success.bg,
  },
  text: {
    ...typography.body,
    color: colors.success.text,
    flex: 1,
  },
});
