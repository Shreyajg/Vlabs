import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  badge,
  colors,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';

export type UnitSelectorProps = {
  units: readonly string[];
  value: string;
  onChange: (unit: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function UnitSelector({
  units,
  value,
  onChange,
  disabled = false,
  style,
}: UnitSelectorProps) {
  return (
    <View style={[styles.row, style]} accessibilityRole="radiogroup">
      {units.map((unit) => {
        const selected = unit === value;

        return (
          <Pressable
            key={unit}
            onPress={() => onChange(unit)}
            disabled={disabled}
            hitSlop={spacing.xs}
            accessibilityRole="radio"
            accessibilityLabel={`Unit ${unit}`}
            accessibilityState={{ selected, disabled }}
            style={[
              styles.chip,
              selected && styles.chipSelected,
              disabled && !selected && styles.chipDisabled,
            ]}
          >
            <Text
              style={[
                styles.text,
                selected && styles.textSelected,
                disabled && !selected && styles.textDisabled,
              ]}
            >
              {unit}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    height: badge.height,
    paddingHorizontal: badge.paddingHorizontal,
    borderRadius: radius.full,
    borderWidth: layout.borderWidth,
    borderColor: colors.border.strong,
    backgroundColor: colors.bg.surface,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.primary.default,
    backgroundColor: colors.primary.soft,
  },
  text: {
    ...typography.badge,
    color: colors.text.secondary,
  },
  textSelected: {
    color: colors.primary.default,
  },
  chipDisabled: {
    backgroundColor: colors.disabled.bg,
    borderColor: colors.border.default,
  },
  textDisabled: {
    color: colors.disabled.text,
  },
});
