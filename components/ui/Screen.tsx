import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
  type Edge,
} from 'react-native-safe-area-context';

import { colors, elevation, layout, spacing } from '@/constants/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView. Defaults to true. */
  scroll?: boolean;
  /** Safe-area edges to apply. Tab screens leave out 'bottom' because the tab bar covers it. */
  edges?: readonly Edge[];
  /** Maximum content width, centered. Defaults to layout.contentMaxWidth. */
  maxWidth?: number;
  /** Pinned bottom action bar, e.g. a primary button. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/** Edges for pushed screens, which have no tab bar. */
export const PUSHED_EDGES: readonly Edge[] = ['top', 'left', 'right', 'bottom'];

export function Screen({
  children,
  scroll = true,
  edges = DEFAULT_EDGES,
  maxWidth = layout.contentMaxWidth,
  footer,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const inner = [styles.inner, { maxWidth }, contentStyle];

  // With a footer, the bar itself absorbs the bottom inset so its fill reaches the screen edge.
  const coversBottom = edges.includes('bottom');
  const safeEdges =
    footer && coversBottom ? edges.filter((edge) => edge !== 'bottom') : edges;

  return (
    <SafeAreaView style={styles.safeArea} edges={safeEdges}>
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.content, styles.grow]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]}>
          <View style={[inner, styles.fill]}>{children}</View>
        </View>
      )}

      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: spacing.md + (coversBottom ? insets.bottom : 0) },
          ]}
        >
          <View style={[styles.footerInner, { maxWidth }]}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.page,
  },
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  content: {
    paddingHorizontal: layout.pagePadding,
    paddingTop: spacing.lg,
    paddingBottom: layout.scrollBottomPadding,
  },
  inner: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
  },
  footer: {
    backgroundColor: colors.bg.surface,
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border.default,
    paddingHorizontal: layout.pagePadding,
    paddingTop: spacing.md,
    ...elevation.e1,
    shadowOffset: { width: 0, height: -spacing.xs },
  },
  footerInner: {
    width: '100%',
    alignSelf: 'center',
  },
});
