import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeChartLayout, formatTick } from "../chartGeometry";

const padding = { top: 10, right: 10, bottom: 40, left: 50 };
const size = { width: 350, height: 250, padding };
// plot area: 290 wide, 200 high

describe("computeChartLayout: linear", () => {
  const chart = computeChartLayout({
    points: [
      { x: 10, y: 20 },
      { x: 0, y: 0 },
      { x: 5, y: 10 },
    ],
    xScale: "linear",
    yScale: "linear",
    ...size,
  });

  it("orders points by x so a line can join them", () => {
    assert.ok(chart);
    assert.deepEqual(
      chart.points.map((point) => Math.round(point.x)),
      [50, 195, 340],
    );
  });

  it("keeps every point inside the plot area", () => {
    assert.ok(chart);

    for (const point of chart.points) {
      assert.ok(point.x >= chart.plot.left && point.x <= chart.plot.left + chart.plot.width);
      assert.ok(point.y >= chart.plot.top && point.y <= chart.plot.top + chart.plot.height);
    }
  });

  it("puts larger y values higher on screen", () => {
    assert.ok(chart);
    assert.ok(chart.points[2].y < chart.points[0].y);
  });

  it("produces ordered ticks that cover the data", () => {
    assert.ok(chart);
    assert.deepEqual(chart.xTicks.map((tick) => tick.label), ["0", "5", "10"]);

    for (let index = 1; index < chart.xTicks.length; index += 1) {
      assert.ok(chart.xTicks[index].position > chart.xTicks[index - 1].position);
    }

    assert.equal(chart.xTicks[0].position, 0);
    assert.equal(Math.round(chart.xTicks[chart.xTicks.length - 1].position), 290);
  });
});

describe("computeChartLayout: log (pipeflow, f vs NRe)", () => {
  const chart = computeChartLayout({
    points: [
      { x: 125, y: 24721.2 },
      { x: 250, y: 9269.85 },
      { x: 500, y: 3089.925 },
    ],
    xScale: "log",
    yScale: "log",
    ...size,
  });

  it("places ticks on powers of ten", () => {
    assert.ok(chart);
    assert.deepEqual(chart.xTicks.map((tick) => tick.label), ["1e2", "1e3"]);
    assert.deepEqual(chart.xTicks.map((tick) => tick.value), [100, 1000]);
    assert.deepEqual(chart.yTicks.map((tick) => tick.label), ["1e3", "1e4", "1e5"]);
  });

  it("maps values by their logarithm", () => {
    assert.ok(chart);

    const expectedX = padding.left + ((Math.log10(125) - 2) / (3 - 2)) * 290;

    assert.ok(Math.abs(chart.points[0].x - expectedX) < 1e-9);
  });

  it("draws x increasing and this f decreasing, so the curve slopes down", () => {
    assert.ok(chart);
    assert.ok(chart.points[0].x < chart.points[1].x && chart.points[1].x < chart.points[2].x);
    assert.ok(chart.points[0].y < chart.points[1].y && chart.points[1].y < chart.points[2].y);
  });
});

describe("computeChartLayout: edge cases", () => {
  it("drops points that cannot be drawn on a log axis and counts them", () => {
    const chart = computeChartLayout({
      points: [
        { x: 10, y: 10 },
        { x: 0, y: 5 },
        { x: 20, y: -1 },
        { x: Number.NaN, y: 3 },
        { x: 100, y: 100 },
      ],
      xScale: "log",
      yScale: "log",
      ...size,
    });

    assert.ok(chart);
    assert.equal(chart.points.length, 2);
    assert.equal(chart.dropped, 3);
  });

  it("returns null when nothing can be drawn", () => {
    assert.equal(
      computeChartLayout({ points: [{ x: -1, y: -1 }], xScale: "log", yScale: "log", ...size }),
      null,
    );
    assert.equal(computeChartLayout({ points: [], xScale: "linear", yScale: "linear", ...size }), null);
  });

  it("returns null when the size leaves no room to plot", () => {
    assert.equal(
      computeChartLayout({
        points: [{ x: 1, y: 1 }],
        xScale: "linear",
        yScale: "linear",
        width: 40,
        height: 30,
        padding,
      }),
      null,
    );
  });

  it("handles a single point (all values equal) without NaN", () => {
    const chart = computeChartLayout({
      points: [{ x: 5, y: 5 }],
      xScale: "linear",
      yScale: "linear",
      ...size,
    });

    assert.ok(chart);
    assert.equal(chart.points.length, 1);
    assert.ok(Number.isFinite(chart.points[0].x) && Number.isFinite(chart.points[0].y));
    assert.ok(chart.xTicks.length >= 2);
  });

  it("handles a single point on a log axis", () => {
    const chart = computeChartLayout({
      points: [{ x: 125, y: 0.04 }],
      xScale: "log",
      yScale: "log",
      ...size,
    });

    assert.ok(chart);
    assert.ok(Number.isFinite(chart.points[0].x) && Number.isFinite(chart.points[0].y));
  });

  it("spaces log ticks out when the data spans many decades", () => {
    const chart = computeChartLayout({
      points: [{ x: 1e-6, y: 1 }, { x: 1e9, y: 2 }],
      xScale: "log",
      yScale: "linear",
      ...size,
    });

    assert.ok(chart);
    assert.ok(chart.xTicks.length <= 9);
  });
});

describe("formatTick", () => {
  it("formats readable numbers compactly", () => {
    assert.equal(formatTick(0), "0");
    assert.equal(formatTick(0.5), "0.5");
    assert.equal(formatTick(1234.5678), "1230");
    assert.equal(formatTick(-2), "-2");
  });

  it("switches to exponent form for very large and very small values", () => {
    assert.equal(formatTick(1500000), "1.5e6");
    assert.equal(formatTick(0.00005), "5.0e-5");
  });
});
