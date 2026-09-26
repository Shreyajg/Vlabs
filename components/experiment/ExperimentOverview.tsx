import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/SectionTitle';
import {
  colors,
  iconSizes,
  layout,
  spacing,
  typography,
} from '@/constants/theme';

export type ExperimentOverviewProps = {
  aim?: string | string[];
  theory?: string;
  procedure?: string[];
};

export function ExperimentOverview({
  aim,
  theory,
  procedure,
}: ExperimentOverviewProps) {
  const aims = aim ? (Array.isArray(aim) ? aim : [aim]) : [];
  const steps = Array.isArray(procedure) ? procedure : [];

  return (
    <View style={styles.sections}>
      {aims.length > 0 ? (
        <View>
          <SectionTitle title="Aim" />
          <Card style={styles.list}>
            {aims.map((item, index) => (
              <View key={index} style={styles.aimRow}>
                <View style={styles.aimIcon}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={iconSizes.banner}
                    color={colors.teal.icon}
                  />
                </View>
                <Text style={styles.body}>{item}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {theory ? (
        <View>
          <SectionTitle title="Theory" />
          <Card variant="peach" padding="feature">
            <Text style={styles.body}>{theory}</Text>
          </Card>
        </View>
      ) : null}

      {steps.length > 0 ? (
        <View>
          <SectionTitle title="Procedure" />
          <Card style={styles.list}>
            {steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.body}>{step}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: layout.sectionGap,
  },
  list: {
    gap: spacing.md,
  },
  aimRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  aimIcon: {
    height: typography.body.lineHeight,
    justifyContent: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    ...typography.body,
    fontWeight: typography.label.fontWeight,
    color: colors.primary.default,
    width: spacing.lg,
  },
  body: {
    ...typography.body,
    color: colors.text.primary,
    flex: 1,
  },
});
