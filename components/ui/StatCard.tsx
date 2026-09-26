import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, layout, spacing, typography } from '@/constants/theme';

import { Card } from './Card';
import { IconTile, type IconTileTone } from './IconTile';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type StatCardProps = {
  icon: IconName;
  tone?: IconTileTone;
  value: string;
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function StatCard({
  icon,
  tone = 'primary',
  value,
  label,
  style,
}: StatCardProps) {
  return (
    <Card style={[styles.card, style]}>
      <IconTile icon={icon} tone={tone} size="sm" />

      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}

/** Lays stat cards out two per row. */
export function StatGrid({ stats }: { stats: readonly StatCardProps[] }) {
  const rows: (readonly StatCardProps[])[] = [];

  for (let index = 0; index < stats.length; index += 2) {
    rows.push(stats.slice(index, index + 2));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
          {row.length < 2 ? <View style={styles.spacer} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  value: {
    ...typography.stat,
    color: colors.text.primary,
    marginTop: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  grid: {
    gap: layout.cardGap,
  },
  row: {
    flexDirection: 'row',
    gap: layout.cardGap,
  },
  spacer: {
    flex: 1,
  },
});
