import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, input, spacing, typography } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const DEFAULT_MULTILINE_ROWS = 4;

export type TextFieldProps = Omit<
  TextInputProps,
  'style' | 'editable' | 'placeholderTextColor'
> & {
  label?: string;
  helperText?: string;
  /** When set, the field shows the error state and this message replaces helperText. */
  error?: string;
  icon?: IconName;
  /** Unit suffix chip, e.g. "kg/m³". */
  unit?: string;
  /** Element after the input, e.g. a show/hide password button. */
  trailing?: ReactNode;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  helperText,
  error,
  icon,
  unit,
  trailing,
  disabled = false,
  containerStyle,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...inputProps
}: TextFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const multiline = Boolean(inputProps.multiline);
  const rows = inputProps.numberOfLines ?? DEFAULT_MULTILINE_ROWS;
  const hasError = Boolean(error);
  const message = error || helperText;
  const isFocused = focused && !disabled;

  const borderColor = disabled
    ? colors.border.default
    : hasError
      ? colors.error.solid
      : isFocused
        ? colors.primary.default
        : colors.border.strong;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        accessible={false}
        disabled={disabled}
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.field,
          multiline
            ? [
                styles.fieldMultiline,
                {
                  minHeight:
                    spacing.md * 2 + typography.body.lineHeight * rows,
                },
              ]
            : styles.fieldSingle,
          {
            borderColor,
            borderWidth: isFocused ? input.focusBorderWidth : input.borderWidth,
            backgroundColor: disabled ? colors.disabled.bg : colors.bg.surface,
          },
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={input.iconSize}
            color={colors.text.muted}
            style={styles.icon}
          />
        ) : null}

        <TextInput
          ref={inputRef}
          {...inputProps}
          editable={!disabled}
          placeholderTextColor={colors.text.muted}
          accessibilityLabel={accessibilityLabel ?? label}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            disabled && styles.inputDisabled,
          ]}
        />

        {unit ? (
          <View
            style={[
              styles.unitChip,
              disabled && { backgroundColor: colors.bg.surface },
            ]}
          >
            <Text style={styles.unitText}>{unit}</Text>
          </View>
        ) : null}

        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Pressable>

      {message ? (
        <Text style={[styles.helper, hasError && styles.helperError]}>
          {message}
        </Text>
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
    borderRadius: input.radius,
    paddingHorizontal: input.paddingHorizontal,
    flexDirection: 'row',
  },
  fieldSingle: {
    height: input.height,
    alignItems: 'center',
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  icon: {
    marginRight: input.iconGap,
  },
  input: {
    flex: 1,
    ...typography.input,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  inputMultiline: {
    lineHeight: typography.body.lineHeight,
    textAlignVertical: 'top',
    alignSelf: 'stretch',
  },
  inputDisabled: {
    color: colors.disabled.text,
  },
  unitChip: {
    height: input.unitChip.height,
    paddingHorizontal: input.unitChip.paddingHorizontal,
    borderRadius: input.unitChip.radius,
    backgroundColor: colors.disabled.bg,
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  unitText: {
    ...typography.badge,
    color: colors.text.secondary,
  },
  trailing: {
    marginLeft: spacing.sm,
  },
  helper: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: input.helperGap,
  },
  helperError: {
    color: colors.error.text,
  },
});
