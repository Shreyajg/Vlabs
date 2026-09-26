import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  button,
  buttonSizes,
  colors,
  iconSizes,
  layout,
  typography,
  type ButtonSize,
} from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type SecondaryButtonProps = {
  title: string;
  onPress: () => void;
  /** lg = 54, md = 48, sm = 40. Defaults to 'md'. */
  size?: ButtonSize;
  icon?: IconName;
  /** Forward actions (arrow-forward) go right, everything else left. Defaults to 'left'. */
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the parent's width. Defaults to true. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function SecondaryButton({
  title,
  onPress,
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityLabel,
  style,
}: SecondaryButtonProps) {
  const dimensions = buttonSizes[size];
  const inactive = disabled || loading;
  const textColor = disabled ? colors.disabled.text : colors.primary.default;

  const iconElement = icon ? (
    <Ionicons name={icon} size={iconSizes.control} color={textColor} />
  ) : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: dimensions.height,
          paddingHorizontal: dimensions.paddingHorizontal,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderColor: disabled ? colors.border.default : colors.border.strong,
          backgroundColor: disabled
            ? colors.disabled.bg
            : pressed
              ? colors.ui.rowPressed
              : colors.bg.surface,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.content,
          { gap: dimensions.gap },
          loading && styles.hidden,
        ]}
      >
        {iconPosition === 'left' ? iconElement : null}
        <Text style={[typography.button, { color: textColor }]}>{title}</Text>
        {iconPosition === 'right' ? iconElement : null}
      </View>

      {loading ? (
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color={colors.primary.default}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: button.radius,
    borderWidth: layout.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    opacity: 0,
  },
});
