import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  button,
  colors,
  iconSizes,
  layout,
} from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconButtonProps = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Use 'danger' for destructive actions such as delete. Defaults to 'default'. */
  tone?: 'default' | 'danger';
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'default',
  style,
}: IconButtonProps) {
  const danger = tone === 'danger';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: danger ? colors.error.border : colors.border.strong,
          backgroundColor: pressed
            ? danger
              ? colors.error.bgSubtle
              : colors.ui.rowPressed
            : colors.bg.surface,
        },
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSizes.control}
        color={danger ? colors.error.solid : colors.text.secondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: button.iconButtonSize,
    height: button.iconButtonSize,
    borderRadius: button.radius,
    borderWidth: layout.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
