import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, elevation, layout, radius } from '@/constants/theme';

export type CardVariant = 'base' | 'mint' | 'peach' | 'elevated';
export type CardPadding = keyof typeof layout.cardPadding;

export type CardProps = Omit<ViewProps, 'style'> & {
  variant?: CardVariant;
  /** A cardPadding token name, or an explicit number. Defaults to 'compact'. */
  padding?: CardPadding | number;
  /** Makes the card pressable, with a pressed fill. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const VARIANTS = {
  base: {
    background: colors.bg.surface,
    border: colors.border.default,
    pressed: colors.ui.rowPressed,
    shadow: elevation.e0,
  },
  elevated: {
    background: colors.bg.surface,
    border: colors.border.default,
    pressed: colors.ui.rowPressed,
    shadow: elevation.e1,
  },
  mint: {
    background: colors.mint[100],
    border: colors.mint.border,
    pressed: colors.mint[50],
    shadow: elevation.e0,
  },
  peach: {
    background: colors.peach[50],
    border: colors.peach.border,
    pressed: colors.peach[100],
    shadow: elevation.e0,
  },
} as const;

export function Card({
  variant = 'base',
  padding = 'compact',
  onPress,
  style,
  children,
  ...rest
}: CardProps) {
  const tokens = VARIANTS[variant];

  const cardStyle: ViewStyle = {
    backgroundColor: tokens.background,
    borderColor: tokens.border,
    borderWidth: layout.borderWidth,
    borderRadius: radius.lg,
    padding: typeof padding === 'number' ? padding : layout.cardPadding[padding],
    ...tokens.shadow,
  };

  if (!onPress) {
    return (
      <View style={[cardStyle, style]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        cardStyle,
        pressed && { backgroundColor: tokens.pressed },
        style,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
