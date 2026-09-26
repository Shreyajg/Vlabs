import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  badge,
  chips,
  iconSizes,
  radius,
  typography,
  type ChipTone,
} from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type BadgeProps = {
  label: string;
  /** Defaults to 'neutral'. */
  tone?: ChipTone;
  /** Leading icon. Ignored when `dot` is set. */
  icon?: IconName;
  /** Leading status dot. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone = 'neutral', icon, dot, style }: BadgeProps) {
  const { text, bg } = chips[tone];

  return (
    <View style={[styles.base, { backgroundColor: bg }, style]}>
      {dot ? (
        <View style={[styles.dot, { backgroundColor: text }]} />
      ) : icon ? (
        <Ionicons
          name={icon}
          size={iconSizes.badge}
          color={text}
          style={styles.leading}
        />
      ) : null}

      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: badge.height,
    paddingHorizontal: badge.paddingHorizontal,
    borderRadius: badge.radius,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  dot: {
    width: badge.dotSize,
    height: badge.dotSize,
    borderRadius: radius.full,
    marginRight: badge.iconGap,
  },
  leading: {
    marginRight: badge.iconGap,
  },
  label: {
    ...typography.badge,
  },
});
