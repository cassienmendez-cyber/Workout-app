import { useMemo, useState } from 'react';
import { formatShortDate } from '../../lib/dates';

/**
 * Interactive line graph (spec 61).
 *
 * Deliberately hand-rolled SVG: no charting dependency, scales to any width,
 * and reads correctly in both themes because every colour is a token.
 */

export interface Point {
  date: string;
  value: number;
}

export function LineChart({
  points,
  unit = '',
  height = 170,
  formatValue,
}: {
  points: Point[];
  unit?: string;
  height?: number;
  formatValue?: (value: number) => string;
}): JSX.Element {
  const [active, setActive] = useState<number | null>(null);
  const width = 320;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;

  const { path, area, coords, min, max } = useMemo(() => {
    if (points.length === 0) {
      return { path: '', area: '', coords: [] as { x: number; y: number }[], min: 0, max: 0 };
    }
    const values = points.map((p) => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // A flat series still needs a band to draw in.
    const pad = rawMax === rawMin ? Math.max(1, rawMax * 0.1) : (rawMax - rawMin) * 0.15;
    const lo = rawMin - pad;
    const hi = rawMax + pad;

    const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
    const plotHeight = height - padTop - padBottom;

    const pts = points.map((p, i) => ({
      x: padX + i * stepX,
      y: padTop + plotHeight - ((p.value - lo) / (hi - lo)) * plotHeight,
    }));

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const fill =
      pts.length > 1
        ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${height - padBottom} L${pts[0].x.toFixed(1)},${height - padBottom} Z`
        : '';

    return { path: line, area: fill, coords: pts, min: rawMin, max: rawMax };
  }, [points, height]);

  if (points.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 30 }}>
        <p className="muted" style={{ margin: 0 }}>Not enough data yet.</p>
      </div>
    );
  }

  const fmt = formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);
  const activePoint = active !== null ? points[active] : null;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="num" style={{ fontSize: 24 }}>
          {activePoint ? fmt(activePoint.value) : fmt(points[points.length - 1].value)}
        </span>
        <span className="tiny">
          {activePoint ? formatShortDate(activePoint.date) : `${points.length} entries`}
        </span>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Line chart, ${points.length} points, from ${fmt(min)} to ${fmt(max)}`}
      >
        <line
          className="chart-grid"
          x1={padX}
          y1={height - padBottom}
          x2={width - padX}
          y2={height - padBottom}
        />
        {area && <path className="chart-area" d={area} />}
        <path className="chart-line" d={path} vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <g key={points[i].date + i}>
            <circle
              className="chart-dot"
              cx={c.x}
              cy={c.y}
              r={active === i ? 5 : coords.length > 25 ? 0 : 3}
            />
            {/* Generous invisible hit area so points are tappable on a phone. */}
            <rect
              x={c.x - 10}
              y={0}
              width={20}
              height={height}
              fill="transparent"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            />
          </g>
        ))}
      </svg>
      <div className="row-between tiny">
        <span>{formatShortDate(points[0].date)}</span>
        <span>{formatShortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

/** Simple bar series for workout frequency (spec 61). */
export function BarChart({
  bars,
  labels,
}: {
  bars: number[];
  labels: string[];
}): JSX.Element {
  const max = Math.max(1, ...bars);
  return (
    <div>
      <div className="bars">
        {bars.map((value, i) => (
          <div
            key={i}
            style={{ height: `${(value / max) * 100}%`, opacity: value === 0 ? 0.18 : 0.85 }}
            title={`${labels[i]}: ${value}`}
          />
        ))}
      </div>
      <div className="row-between tiny" style={{ marginTop: 6 }}>
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}
