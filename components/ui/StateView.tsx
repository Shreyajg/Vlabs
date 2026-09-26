import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  colors,
  iconSizes,
  radius,
  spacing,
  stateView,
  typography,
} from '@/constants/theme';

import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type StateViewVariant = 'loading' | 'empty' | 'error';

export type StateViewProps = {
  variant: StateViewVariant;
  title?: string;
  message?: string;
  /** Overrides the default empty/error icon. */
  icon?: IconName;
  /** 'ai' tints the empty state with the AI accent. Only for AI screens. Defaults to 'default'. */
  tone?: 'default' | 'ai';
  /** Error state defaults to "Try again" when onAction is set. */
  actionLabel?: string;
  onAction?: () => void;
  /** Fill the available space and center. Defaults to true. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_TITLES = {
  loading: undefined,
  empty: 'Nothing here yet',
  error: 'Something went wrong',
} as const;

const DEFAULT_ICONS: Record<'empty' | 'error', IconName> = {
  empty: 'file-tray-outline',
  error: 'alert-circle-outline',
};

export function StateView({
  variant,
  title = DEFAULT_TITLES[variant],
  message,
  icon,
  tone = 'default',
  actionLabel,
  onAction,
  fill = true,
  style,
}: StateViewProps) {
  const containerStyle = [styles.container, fill && styles.fill, style];

  if (variant === 'loading') {
    const loadingMessage = message ?? 'Loading...';

    return (
      <View
        style={containerStyle}
        accessibilityRole="progressbar"
        accessibilityLabel={loadingMessage}
      >
        <ActivityIndicator size="large" color={colors.primary.default} />
        {title ? <Text style={[styles.title, styles.afterVisual]}>{title}</Text> : null}
        <Text style={[styles.message, styles.afterVisualTight]}>
          {loadingMessage}
        </Text>
      </View>
    );
  }

  const isError = variant === 'error';
  const isAi = tone === 'ai';
  const resolvedActionLabel = actionLabel ?? (isError ? 'Try again' : undefined);
  const showAction = Boolean(onAction && resolvedActionLabel);

  return (
    <View
      style={containerStyle}
      accessibilityRole={isError ? 'alert' : undefined}
    >
      <View
        style={[
          styles.circle,
          {
            backgroundColor: isError
              ? colors.error.bg
              : isAi
                ? colors.ai.soft
                : colors.mint[100],
          },
        ]}
      >
        <Ionicons
          name={icon ?? DEFAULT_ICONS[variant]}
          size={iconSizes.empty}
          color={
            isError
              ? colors.error.solid
              : isAi
                ? colors.ai.default
                : colors.teal.icon
          }
        />
      </View>

      {title ? <Text style={[styles.title, styles.afterVisual]}>{title}</Text> : null}
      {message ? (
        <Text style={[styles.message, styles.afterVisualTight]}>{message}</Text>
      ) : null}

      {showAction && onAction && resolvedActionLabel ? (
        <View style={styles.action}>
          {isError ? (
            <SecondaryButton
              title={resolvedActionLabel}
              onPress={onAction}
              fullWidth={false}
            />
          ) : (
            <PrimaryButton
              title={resolvedActionLabel}
              onPress={onAction}
              fullWidth={false}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: stateView.padding,
  },
  fill: {
    flex: 1,
  },
  circle: {
    width: stateView.circleSize,
    height: stateView.circleSize,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: stateView.messageMaxWidth,
  },
  afterVisual: {
    marginTop: spacing.lg,
  },
  afterVisualTight: {
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.xl,
  },
});
