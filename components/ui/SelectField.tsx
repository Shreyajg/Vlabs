import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  colors,
  iconSizes,
  input,
  layout,
  spacing,
  typography,
} from '@/constants/theme';

export type SelectFieldProps = {
  label?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  containerStyle,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        onPress={() => setOpen(!open)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        style={[
          styles.field,
          {
            borderColor: disabled
              ? colors.border.default
              : open
                ? colors.primary.default
                : colors.border.strong,
            borderWidth: open && !disabled ? input.focusBorderWidth : input.borderWidth,
            backgroundColor: disabled ? colors.disabled.bg : colors.bg.surface,
          },
        ]}
      >
        <Text
          style={[styles.value, !value && styles.placeholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>

        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={input.iconSize}
          color={colors.text.muted}
        />
      </Pressable>

      {open ? (
        <View style={styles.menu}>
          {options.map((option, index) => {
            const selected = option === value;

            return (
              <Pressable
                key={option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.option,
                  index > 0 && styles.optionDivider,
                  selected && styles.optionSelected,
                ]}
              >
                <Text
                  style={[styles.optionText, selected && styles.optionTextSelected]}
                >
                  {option}
                </Text>

                {selected ? (
                  <Ionicons
                    name="checkmark"
                    size={iconSizes.control}
                    color={colors.primary.default}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    color: colors.text.strong,
    marginBottom: input.labelGap,
  },
  field: {
    height: input.height,
    borderRadius: input.radius,
    paddingHorizontal: input.paddingHorizontal,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  value: {
    ...typography.input,
    color: colors.text.primary,
    flex: 1,
  },
  placeholder: {
    color: colors.text.muted,
  },
  menu: {
    marginTop: spacing.xs,
    borderRadius: input.radius,
    borderWidth: layout.borderWidth,
    borderColor: colors.border.strong,
    backgroundColor: colors.bg.surface,
    overflow: 'hidden',
  },
  option: {
    minHeight: input.height,
    paddingHorizontal: input.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  optionDivider: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
  },
  optionSelected: {
    backgroundColor: colors.primary.soft,
  },
  optionText: {
    ...typography.input,
    color: colors.text.primary,
    flex: 1,
  },
  optionTextSelected: {
    color: colors.primary.default,
  },
});
