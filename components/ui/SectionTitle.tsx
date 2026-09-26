import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, layout, spacing, typography } from '@/constants/theme';

export type SectionTitleProps = {
  title: string;
  caption?: string;
  /** Adds the section gap above the title. Use for every section after the first. */
  spacedTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SectionTitle({
  title,
  caption,
  spacedTop = false,
  style,
}: SectionTitleProps) {
  return (
    <View style={[styles.container, spacedTop && styles.spacedTop, style]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: layout.sectionTitleGap,
  },
  spacedTop: {
    marginTop: layout.sectionGap,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  caption: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
