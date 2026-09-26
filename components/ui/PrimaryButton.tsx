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
  typography,
  type ButtonSize,
} from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type PrimaryButtonProps = {
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

export function PrimaryButton({
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
}: PrimaryButtonProps) {
  const dimensions = buttonSizes[size];
  const inactive = disabled || loading;
  const textColor = disabled ? colors.disabled.text : colors.text.onPrimary;

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
          backgroundColor: disabled
            ? colors.disabled.bg
            : pressed
              ? colors.primary.pressed
              : colors.primary.default,
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
          color={colors.text.onPrimary}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: button.radius,
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
