import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  colors,
  iconSizes,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type HeaderAction = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
};

type RootHeaderProps = {
  variant?: 'root';
  title: string;
  subtitle?: string;
  action?: HeaderAction;
  /** Custom trailing element, e.g. a small button. Takes precedence over `action`. */
  trailing?: ReactNode;
};

type PushedHeaderProps = {
  variant: 'pushed';
  title: string;
  subtitle?: string;
  /** Defaults to router.back(). */
  onBack?: () => void;
  trailing?: ReactNode;
};

export type ScreenHeaderProps = RootHeaderProps | PushedHeaderProps;

function goBack() {
  if (router.canGoBack()) {
    router.back();
  }
}

export function ScreenHeader(props: ScreenHeaderProps) {
  const { title, subtitle } = props;

  if (props.variant === 'pushed') {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={props.onBack ?? goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={iconSizes.tileSm}
            color={colors.text.primary}
          />
        </Pressable>

        <View style={[styles.titleBlock, styles.pushedTitleBlock]}>
          <Text style={styles.h2} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {props.trailing ? (
          <View style={styles.trailing}>{props.trailing}</View>
        ) : null}
      </View>
    );
  }

  const { action, trailing } = props;

  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        <Text style={styles.h1} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {trailing ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          style={({ pressed }) => [
            styles.actionTile,
            pressed && styles.actionTilePressed,
          ]}
        >
          <Ionicons
            name={action.icon}
            size={iconSizes.tileSm}
            color={colors.primary.default}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  titleBlock: {
    flex: 1,
  },
  pushedTitleBlock: {
    marginLeft: spacing.md,
  },
  trailing: {
    marginLeft: spacing.md,
  },
  h1: {
    ...typography.h1,
    color: colors.text.primary,
  },
  h2: {
    ...typography.h2,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  backButton: {
    width: layout.header.backButtonSize,
    height: layout.header.backButtonSize,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    borderColor: colors.border.strong,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    backgroundColor: colors.ui.rowPressed,
  },
  actionTile: {
    width: layout.header.actionTileSize,
    height: layout.header.actionTileSize,
    borderRadius: radius.full,
    backgroundColor: colors.primary.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  actionTilePressed: {
    backgroundColor: colors.ui.rowPressed,
  },
});
