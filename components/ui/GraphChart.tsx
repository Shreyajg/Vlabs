import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  colors,
  layout,
  radius,
  spacing,
  typography,
} from '@/constants/theme';

import {
  computeChartLayout,
  type AxisScale,
  type ChartInputPoint,
} from '../../services/calculation/chartGeometry';

/** One line of a chart that draws several series on the same axes. */
export type GraphChartSeries = {
  label: string;
  points: readonly ChartInputPoint[];
};

export type GraphChartProps = {
  points: readonly ChartInputPoint[];
  /** For several lines on one chart. When given, `points` is ignored. */
  series?: readonly GraphChartSeries[];
  xLabel: string;
  yLabel: string;
  /** The scale of both axes. */
  scale: AxisScale;
  /** Overrides `scale` for one axis (a semi-log graph is xScale "log" with yScale "linear"). */
  xScale?: AxisScale;
  yScale?: AxisScale;
  accessibilityLabel: string;
};

const PADDING = {
  top: spacing.lg,
  right: spacing.lg,
  bottom: spacing['4xl'] + spacing.sm,
  left: spacing['4xl'] + spacing.lg,
};

const LINE_WIDTH = layout.borderWidth * 2;
const ASPECT_RATIO = 0.7;

// Series are told apart by colour AND marker shape (circle, then square), so the chart does not rely on
// colour alone. Only existing theme colours are used.
const SERIES_LINE_COLORS = [colors.teal.default, colors.primary.default] as const;
const SERIES_MARKER_COLORS = [colors.teal.icon, colors.primary.default] as const;
const MARKER_SIZE = spacing.xs * 2;

export function GraphChart({
  points,
  series,
  xLabel,
  yLabel,
  scale,
  xScale,
  yScale,
  accessibilityLabel,
}: GraphChartProps) {
  const [width, setWidth] = useState(0);
  const height = Math.round(width * ASPECT_RATIO);

  const chart =
    width > 0
      ? computeChartLayout({
          points,
          series: series?.map((line) => ({ points: line.points })),
          xScale: xScale ?? scale,
          yScale: yScale ?? scale,
          width,
          height,
          padding: PADDING,
        })
      : null;

  const fontSize = typography.caption.fontSize;
  const showLegend = (series?.length ?? 0) > 1;

  return (
    <View
      style={styles.container}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {chart ? (
        <Svg width={width} height={height}>
          {chart.yTicks.map((tick) => (
            <G key={`y-${tick.label}`}>
              <Line
                x1={chart.plot.left}
                x2={chart.plot.left + chart.plot.width}
                y1={chart.plot.top + tick.position}
                y2={chart.plot.top + tick.position}
                stroke={colors.border.default}
                strokeWidth={layout.borderWidth}
              />
              <SvgText
                x={chart.plot.left - spacing.sm}
                y={chart.plot.top + tick.position + fontSize / 3}
                fontSize={fontSize}
                fill={colors.text.secondary}
                textAnchor="end"
              >
                {tick.label}
              </SvgText>
            </G>
          ))}

          {chart.xTicks.map((tick) => (
            <G key={`x-${tick.label}`}>
              <Line
                x1={chart.plot.left + tick.position}
                x2={chart.plot.left + tick.position}
                y1={chart.plot.top}
                y2={chart.plot.top + chart.plot.height}
                stroke={colors.border.default}
                strokeWidth={layout.borderWidth}
              />
              <SvgText
                x={chart.plot.left + tick.position}
                y={chart.plot.top + chart.plot.height + spacing.lg}
                fontSize={fontSize}
                fill={colors.text.secondary}
                textAnchor="middle"
              >
                {tick.label}
              </SvgText>
            </G>
          ))}

          <Line
            x1={chart.plot.left}
            x2={chart.plot.left}
            y1={chart.plot.top}
            y2={chart.plot.top + chart.plot.height}
            stroke={colors.border.strong}
            strokeWidth={LINE_WIDTH}
          />
          <Line
            x1={chart.plot.left}
            x2={chart.plot.left + chart.plot.width}
            y1={chart.plot.top + chart.plot.height}
            y2={chart.plot.top + chart.plot.height}
            stroke={colors.border.strong}
            strokeWidth={LINE_WIDTH}
          />

          {chart.series.map((line, seriesIndex) => {
            const lineColor = SERIES_LINE_COLORS[seriesIndex % SERIES_LINE_COLORS.length];
            const markerColor = SERIES_MARKER_COLORS[seriesIndex % SERIES_MARKER_COLORS.length];

            return (
              <G key={`series-${seriesIndex}`}>
                {line.points.length > 1 ? (
                  <Polyline
                    points={line.points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={LINE_WIDTH}
                  />
                ) : null}

                {line.points.map((point, index) =>
                  seriesIndex % 2 === 0 ? (
                    <Circle
                      key={`point-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={spacing.xs}
                      fill={markerColor}
                      stroke={colors.bg.surface}
                      strokeWidth={layout.borderWidth}
                    />
                  ) : (
                    <Rect
                      key={`point-${index}`}
                      x={point.x - spacing.xs}
                      y={point.y - spacing.xs}
                      width={MARKER_SIZE}
                      height={MARKER_SIZE}
                      fill={markerColor}
                      stroke={colors.bg.surface}
                      strokeWidth={layout.borderWidth}
                    />
                  ),
                )}
              </G>
            );
          })}

          <SvgText
            x={chart.plot.left + chart.plot.width / 2}
            y={height - spacing.sm}
            fontSize={fontSize}
            fill={colors.text.strong}
            textAnchor="middle"
          >
            {xLabel}
          </SvgText>
          <SvgText
            x={spacing.md}
            y={chart.plot.top + chart.plot.height / 2}
            fontSize={fontSize}
            fill={colors.text.strong}
            textAnchor="middle"
            transform={`rotate(-90, ${spacing.md}, ${chart.plot.top + chart.plot.height / 2})`}
          >
            {yLabel}
          </SvgText>
        </Svg>
      ) : null}

      {chart && showLegend ? (
        <View style={styles.legend}>
          {series?.map((line, index) => (
            <View key={`legend-${index}`} style={styles.legendItem}>
              <View
                style={[
                  styles.legendMarker,
                  index % 2 === 1 && styles.legendMarkerSquare,
                  { backgroundColor: SERIES_MARKER_COLORS[index % SERIES_MARKER_COLORS.length] },
                ]}
              />

              <Text style={styles.legendText}>{line.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendMarker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.full,
  },
  legendMarkerSquare: {
    borderRadius: 0,
  },
  legendText: {
    ...typography.caption,
    color: colors.text.strong,
  },
});
