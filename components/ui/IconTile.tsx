import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { iconSizes, iconTile } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconTileTone = keyof typeof iconTile.tones;
export type IconTileSize = keyof typeof iconTile.sizes;

export type IconTileProps = {
  icon: IconName;
  /** Defaults to 'primary'. */
  tone?: IconTileTone;
  /** sm = 40, md = 44, lg = 48. Defaults to 'md'. */
  size?: IconTileSize;
  style?: StyleProp<ViewStyle>;
};

export function IconTile({
  icon,
  tone = 'primary',
  size = 'md',
  style,
}: IconTileProps) {
  const dimension = iconTile.sizes[size];
  const { bg, icon: iconColor } = iconTile.tones[tone];

  return (
    <View
      style={[
        styles.base,
        {
          width: dimension,
          height: dimension,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={size === 'sm' ? iconSizes.tileSm : iconSizes.tile}
        color={iconColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: iconTile.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
