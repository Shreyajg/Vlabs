/**
 * Flow Labs design system (light mode only).
 * Import tokens from this file; do not hardcode colors, radii or spacing in screens.
 * Palette roles: ivory = page, white = card, mint = computed/positive surfaces,
 * peach = given/reference surfaces, blue = action. Purple is reserved for AI.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const colors = {
  bg: {
    page: '#FBF7F2',
    surface: '#FFFFFF',
  },

  mint: {
    50: '#F1F8F4',
    100: '#E3F2EA',
    border: '#CFE7DA',
  },

  peach: {
    50: '#FDF3EA',
    100: '#FCEBDD',
    border: '#F4DCC8',
    text: '#9A4A0F',
  },

  disabled: {
    bg: '#F1EEE8',
    text: '#8B95A3',
  },

  primary: {
    default: '#2563EB',
    pressed: '#1D4ED8',
    soft: '#EAF1FE',
  },

  teal: {
    default: '#0F766E',
    icon: '#0D9488',
  },

  // Semantic AI accent. Do not use purple for anything else.
  ai: {
    default: '#6D28D9',
    soft: '#F1EBFE',
  },

  text: {
    primary: '#1C2430',
    strong: '#3A4553',
    secondary: '#5B6675',
    muted: '#8B95A3',
    onPrimary: '#FFFFFF',
  },

  border: {
    default: '#ECE7DF',
    strong: '#DDD6CB',
  },

  success: {
    text: '#166534',
    bg: '#E3F4EA',
    border: '#BFE3CD',
    solid: '#16A34A',
  },

  warning: {
    text: '#92400E',
    bg: '#FDF1D8',
    border: '#F3D9A0',
    solid: '#F59E0B',
  },

  error: {
    text: '#B91C1C',
    bg: '#FDE9E9',
    bgSubtle: '#FEF2F2',
    border: '#FECACA',
    solid: '#DC2626',
  },

  ui: {
    rowPressed: '#FBF9F5',
    skeleton: '#EFEAE1',
    chevron: '#94A3B8',
  },

  shadow: '#3B2F20',
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  display: { fontSize: 32, fontWeight: '800', lineHeight: 38 },
  h1: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 23 },
  label: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stat: { fontSize: 23, fontWeight: '800', lineHeight: 28 },
  mono: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },

  // Component-level text styles
  button: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  link: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  badge: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  tabLabel: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  input: { fontSize: 15, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export const radius = {
  xs: 6,
  sm: 8,
  md: 12, // inputs, buttons, icon tiles
  lg: 16, // cards
  xl: 20, // hero cards, login card, sheets
  full: 999,
} as const;

// ---------------------------------------------------------------------------
// Spacing (4px base)
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const layout = {
  pagePadding: 24,
  contentMaxWidth: 720,
  authMaxWidth: 520,
  cardGap: 12,
  sectionGap: 28,
  sectionTitleGap: 14,
  scrollBottomPadding: 40,
  borderWidth: 1,
  cardPadding: {
    compact: 16, // list rows, stat tiles
    feature: 20, // profile and feature cards
    hero: 24,
  },
  header: {
    backButtonSize: 40,
    actionTileSize: 46,
  },
} as const;

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export const buttonSizes = {
  lg: { height: 54, paddingHorizontal: 24, gap: 10 },
  md: { height: 48, paddingHorizontal: 20, gap: 8 },
  sm: { height: 40, paddingHorizontal: 16, gap: 8 },
} as const;

export type ButtonSize = keyof typeof buttonSizes;

export const button = {
  radius: radius.md,
  iconButtonSize: 40,
} as const;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const input = {
  height: 52,
  radius: radius.md,
  paddingHorizontal: 14,
  borderWidth: 1,
  focusBorderWidth: 1.5,
  iconSize: 20,
  iconGap: 10,
  labelGap: 8,
  fieldGap: 16,
  helperGap: 6,
  unitChip: {
    height: 24,
    paddingHorizontal: 8,
    radius: radius.sm,
  },
} as const;

// ---------------------------------------------------------------------------
// Icons (Ionicons only)
// ---------------------------------------------------------------------------

export const iconSizes = {
  badge: 14,
  banner: 18,
  control: 20, // inputs and buttons
  tileSm: 22,
  tile: 24,
  tabBar: 24,
  empty: 32,
  hero: 48,
} as const;

export const iconTile = {
  radius: radius.md,
  sizes: { sm: 40, md: 44, lg: 48 },
  tones: {
    primary: { bg: colors.primary.soft, icon: colors.primary.default },
    ai: { bg: colors.ai.soft, icon: colors.ai.default },
    mint: { bg: colors.mint[100], icon: colors.teal.icon },
    neutral: { bg: colors.disabled.bg, icon: colors.text.secondary },
  },
} as const;

// ---------------------------------------------------------------------------
// Badges / status chips
// ---------------------------------------------------------------------------

export const badge = {
  height: 26,
  paddingHorizontal: 10,
  radius: radius.sm,
  dotSize: 6,
  iconGap: 5,
} as const;

export const chips = {
  neutral: { text: colors.text.secondary, bg: colors.disabled.bg },
  info: { text: colors.primary.pressed, bg: colors.primary.soft },
  success: { text: colors.success.text, bg: colors.success.bg },
  warning: { text: colors.warning.text, bg: colors.warning.bg },
  error: { text: colors.error.text, bg: colors.error.bg },
  published: { text: colors.teal.default, bg: colors.mint[100] },
  draft: { text: colors.peach.text, bg: colors.peach[100] },
  ai: { text: colors.ai.default, bg: colors.ai.soft },
} as const;

export type ChipTone = keyof typeof chips;

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

export const tabBar = {
  height: 60,
  borderTopWidth: 1,
  background: colors.bg.surface,
  borderColor: colors.border.default,
  activeTint: colors.primary.default,
  inactiveTint: '#6B7686',
} as const;

// ---------------------------------------------------------------------------
// Loading / empty / error states
// ---------------------------------------------------------------------------

export const stateView = {
  padding: 32,
  circleSize: 72,
  messageMaxWidth: 280,
} as const;

// ---------------------------------------------------------------------------
// Elevation (cards are flat: e0 plus a 1px border.default)
// ---------------------------------------------------------------------------

export const elevation = {
  e0: {
    shadowOpacity: 0,
    elevation: 0,
  },
  e1: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  e2: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
} satisfies Record<string, ViewStyle>;

export type ElevationLevel = keyof typeof elevation;

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export const theme = {
  colors,
  typography,
  radius,
  spacing,
  layout,
  buttonSizes,
  button,
  input,
  iconSizes,
  iconTile,
  badge,
  chips,
  tabBar,
  stateView,
  elevation,
} as const;

export type Theme = typeof theme;

// ---------------------------------------------------------------------------
// Legacy Expo template exports.
// Still imported by hooks/use-theme-color.ts, components/ui/collapsible.tsx and
// app/_old_tabs/*. Not part of the Flow Labs design system; remove together
// with those files.
// ---------------------------------------------------------------------------

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
