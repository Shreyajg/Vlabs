import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import { colors, iconSizes, spacing } from '@/constants/theme';

export type PasswordFieldProps = Omit<
  TextFieldProps,
  'secureTextEntry' | 'trailing' | 'icon'
>;

/** A password input with a show/hide toggle. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      icon="lock-closed-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          onPress={() => setVisible(!visible)}
          hitSlop={spacing.sm}
          disabled={props.disabled}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={iconSizes.control}
            color={colors.text.secondary}
          />
        </Pressable>
      }
    />
  );
}
