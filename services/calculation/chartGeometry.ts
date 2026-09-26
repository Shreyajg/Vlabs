// Pure module: the maths behind the graph. GraphChart only draws what this returns.

export type AxisScale = "linear" | "log";

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartInputPoint {
  x: number;
  y: number;
}

/** One line of a graph with several series. All series share the same axes. */
export interface ChartInputSeries {
  points: readonly ChartInputPoint[];
}

export interface AxisTick {
  value: number;
  /** Pixel offset along the axis, from the plot's left (x) or top (y) edge. */
  position: number;
  label: string;
}

export interface ChartLayoutInput {
  /** The points of a single-series graph. Ignored when `series` is given. */
  points: readonly ChartInputPoint[];
  /** The lines of a multi-series graph. The axes are fitted to all of them together. */
  series?: readonly ChartInputSeries[];
  xScale: AxisScale;
  yScale: AxisScale;
  width: number;
  height: number;
  padding: ChartPadding;
}

export interface ChartLayout {
  plot: { left: number; top: number; width: number; height: number };
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  /** Points in pixel coordinates, ordered by their data x value so a line can join them. For several series, the first. */
  points: ChartInputPoint[];
  /** Every series in pixel coordinates, in input order. A single-series graph has exactly one. */
  series: { points: ChartInputPoint[] }[];
  /** Points left out because they cannot be drawn (not finite, or not positive on a log axis). */
  dropped: number;
}

interface AxisDomain {
  /** Domain bounds in axis space (the raw value for linear, log10(value) for log). */
  min: number;
  max: number;
  tickValues: number[];
  toAxis: (value: number) => number;
  format: (value: number) => string;
}

const MAX_TICKS = 8;

export function formatTick(value: number): string {
  if (value === 0) return "0";

  const magnitude = Math.abs(value);

  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(1).replace("+", "");

  return String(Number(value.toPrecision(3)));
}

function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

  return nice * 10 ** exponent;
}

function linearDomain(values: readonly number[]): AxisDomain {
  let low = Math.min(...values);
  let high = Math.max(...values);

  if (low === high) {
    const pad = Math.abs(low) * 0.1 || 1;

    low -= pad;
    high += pad;
  }

  const step = niceStep((high - low) / 4);
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const tickValues: number[] = [];

  for (let value = min, guard = 0; value <= max + step / 2 && guard < MAX_TICKS * 4; guard += 1) {
    tickValues.push(Number(value.toPrecision(12)));
    value += step;
  }

  return { min, max, tickValues, toAxis: (value) => value, format: formatTick };
}

function logDomain(values: readonly number[]): AxisDomain {
  const low = Math.floor(Math.log10(Math.min(...values)));
  let high = Math.ceil(Math.log10(Math.max(...values)));

  if (high === low) high = low + 1;

  const stride = Math.max(1, Math.ceil((high - low) / MAX_TICKS));
  const top = low + stride * Math.ceil((high - low) / stride);
  const tickValues: number[] = [];

  for (let exponent = low; exponent <= top; exponent += stride) tickValues.push(exponent);

  return {
    min: low,
    max: top,
    tickValues,
    toAxis: Math.log10,
    format: (exponent) => `1e${exponent}`,
  };
}

function buildDomain(scale: AxisScale, values: readonly number[]): AxisDomain {
  return scale === "log" ? logDomain(values) : linearDomain(values);
}

/**
 * Lays out a graph. Points that cannot be drawn are dropped and counted, never guessed.
 * Returns null when nothing is drawable or the size leaves no room to plot.
 */
export function computeChartLayout(input: ChartLayoutInput): ChartLayout | null {
  const { xScale, yScale, width, height, padding } = input;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (plotWidth <= 0 || plotHeight <= 0) return null;

  const isDrawable = (point: ChartInputPoint) =>
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (xScale === "linear" || point.x > 0) &&
    (yScale === "linear" || point.y > 0);

  const lines: readonly ChartInputSeries[] =
    input.series && input.series.length > 0 ? input.series : [{ points: input.points }];
  const drawableLines = lines.map((line) => line.points.filter(isDrawable));
  const drawable = drawableLines.flat();

  if (drawable.length === 0) return null;

  // The axes are fitted to every series together, so the lines can be compared on one chart.
  const xDomain = buildDomain(xScale, drawable.map((point) => point.x));
  const yDomain = buildDomain(yScale, drawable.map((point) => point.y));

  const along = (domain: AxisDomain, value: number, length: number) =>
    ((domain.toAxis(value) - domain.min) / (domain.max - domain.min)) * length;

  const xTicks = xDomain.tickValues.map((value) => {
    const axisValue = xScale === "log" ? 10 ** value : value;

    return {
      value: axisValue,
      position: ((value - xDomain.min) / (xDomain.max - xDomain.min)) * plotWidth,
      label: xDomain.format(value),
    };
  });

  const yTicks = yDomain.tickValues.map((value) => {
    const axisValue = yScale === "log" ? 10 ** value : value;

    return {
      value: axisValue,
      position: plotHeight - ((value - yDomain.min) / (yDomain.max - yDomain.min)) * plotHeight,
      label: yDomain.format(value),
    };
  });

  const toPixels = (line: readonly ChartInputPoint[]) =>
    [...line]
      .sort((a, b) => a.x - b.x)
      .map((point) => ({
        x: padding.left + along(xDomain, point.x, plotWidth),
        y: padding.top + plotHeight - along(yDomain, point.y, plotHeight),
      }));

  const series = drawableLines.map((line) => ({ points: toPixels(line) }));
  const inputCount = lines.reduce((total, line) => total + line.points.length, 0);

  return {
    plot: { left: padding.left, top: padding.top, width: plotWidth, height: plotHeight },
    xTicks,
    yTicks,
    points: series[0].points,
    series,
    dropped: inputCount - drawable.length,
  };
}
