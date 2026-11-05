import { useState } from 'react';
import { fillTemplate } from '../i18n';
import { useSettings } from '../settings';
import { convertTemperature, isNumber, percentChange, signed, temperatureSymbol } from '../utils';

const WIDTH = 320;
const HEIGHT = 170;
const PADDING = { top: 40, right: 18, bottom: 26, left: 18 };

const SERIES = [
  { id: 'lstDay', labelKey: 'surfaceTemp', color: '#bf6e3e', marker: 'circle' },
  { id: 'ndvi', labelKey: 'canopyShort', color: '#389560', marker: 'square' },
];

function smoothPath(points) {
  if (points.length < 2) {
    return '';
  }

  const slopes = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    slopes.push((points[i + 1].y - points[i].y) / dx);
  }

  const tangents = [slopes[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before * after <= 0) {
      tangents.push(0);
    } else {
      tangents.push((before + after) / 2);
    }
  }
  tangents.push(slopes[slopes.length - 1]);

  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const third = (end.x - start.x) / 3;
    const c1 = `${start.x + third},${start.y + tangents[i] * third}`;
    const c2 = `${end.x - third},${end.y - tangents[i + 1] * third}`;
    path += ` C${c1} ${c2} ${end.x},${end.y}`;
  }
  return path;
}

function Marker({ shape, x, y, color }) {
  const ring = { stroke: 'var(--trajectory-surface)', strokeWidth: 2 };

  if (shape === 'square') {
    return <rect x={x - 4} y={y - 4} width={8} height={8} rx={1.5} fill={color} {...ring} />;
  }
  return <circle cx={x} cy={y} r={4.5} fill={color} {...ring} />;
}

export default function TrajectoryChart({ years, strings }) {
  const settingsContext = useSettings();
  const text = (strings ?? settingsContext.strings).insights;
  const settings = settingsContext.settings;
  const unit = settings.temperatureUnit;
  const [activeIndex, setActiveIndex] = useState(years.length - 1);

  const firstYear = years[0].year;
  const lastYear = years[years.length - 1].year;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  function xFor(year) {
    return PADDING.left + ((year - firstYear) / (lastYear - firstYear)) * plotWidth;
  }

  const lines = SERIES.map((series) => {
    const first = years[0].values[series.id];
    const changes = years.map((item) => {
      const value = item.values[series.id];
      if (!isNumber(first) || !isNumber(value)) return null;
      return percentChange(first, value);
    });
    return { ...series, changes };
  });

  const allChanges = lines.flatMap((line) => line.changes).filter(isNumber);
  let minChange = Math.min(0, ...allChanges);
  let maxChange = Math.max(0, ...allChanges);
  const padding = (maxChange - minChange) * 0.1 || 1;
  minChange -= padding;
  maxChange += padding;

  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  function yFor(change) {
    return PADDING.top + ((maxChange - change) / (maxChange - minChange)) * plotHeight;
  }

  const gridLines = [PADDING.top, PADDING.top + plotHeight / 2, PADDING.top + plotHeight];

  const active = years[activeIndex];
  const parts = [];
  if (isNumber(active.values.lstDay)) {
    const temperature = convertTemperature(active.values.lstDay, unit).toFixed(1);
    parts.push(temperature + temperatureSymbol(unit));
  }
  if (isNumber(active.values.ndvi)) {
    parts.push(`${active.values.ndvi.toFixed(2)} NDVI`);
  }
  const tooltipText = `${active.year}: ${parts.join(' / ')}`;

  const activeX = xFor(active.year);
  const activePercent = (activeX / WIDTH) * 100;
  let tooltipStyle = { left: `${activePercent}%`, transform: 'translateX(-50%)' };
  if (activePercent > 65) {
    tooltipStyle = { right: '8px' };
  } else if (activePercent < 35) {
    tooltipStyle = { left: '8px' };
  }

  return (
    <figure className="trajectory">
      <div className="trajectory__legend">
        {SERIES.map((series) => (
          <span key={series.id} className="trajectory__chip">
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <Marker shape={series.marker} x={6} y={6} color={series.color} />
            </svg>
            {text[series.labelKey]}
          </span>
        ))}
      </div>

      <div className="trajectory__plot" dir="ltr">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={fillTemplate(text.chartLabel, { year: firstYear })}>
          <defs>
            <linearGradient id="trajectory-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((y) => (
            <line key={y} className="trajectory__grid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
          ))}
          <line
            className="trajectory__zero"
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={yFor(0)}
            y2={yFor(0)}
          />

          <line className="trajectory__crosshair" x1={activeX} x2={activeX} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} />

          {lines.map((line, lineIndex) => {
            const points = [];
            line.changes.forEach((change, i) => {
              if (isNumber(change)) {
                points.push({ x: xFor(years[i].year), y: yFor(change) });
              }
            });
            const path = smoothPath(points);

            let area = null;
            if (lineIndex === 0 && points.length > 1) {
              const bottom = HEIGHT - PADDING.bottom;
              const last = points[points.length - 1];
              area = `${path} L${last.x},${bottom} L${points[0].x},${bottom} Z`;
            }

            return (
              <g key={line.id}>
                {area && <path d={area} fill="url(#trajectory-fill)" />}
                <path d={path} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" />
                {points.map((point) => (
                  <Marker key={point.x} shape={line.marker} x={point.x} y={point.y} color={line.color} />
                ))}
              </g>
            );
          })}

          {years.map((item, i) => {
            const isLast = i === years.length - 1;
            const className = isLast ? 'trajectory__year trajectory__year--last' : 'trajectory__year';
            let anchor = 'middle';
            if (i === 0) anchor = 'start';
            if (isLast) anchor = 'end';

            return (
              <text key={item.year} className={className} x={xFor(item.year)} y={HEIGHT - 8} textAnchor={anchor}>
                {item.year}
              </text>
            );
          })}

          {years.map((item, i) => {
            const columnWidth = plotWidth / (years.length - 1);
            return (
              <rect
                key={item.year}
                x={xFor(item.year) - columnWidth / 2}
                y={0}
                width={columnWidth}
                height={HEIGHT}
                fill="transparent"
                onPointerEnter={() => setActiveIndex(i)}
                onClick={() => setActiveIndex(i)}
              />
            );
          })}
        </svg>

        <div className="trajectory__tooltip" style={tooltipStyle} dir="ltr">
          <span className="trajectory__tooltip-dot" />
          {tooltipText}
        </div>
      </div>

      <figcaption className="trajectory__axis">{fillTemplate(text.chartAxis, { year: firstYear })}</figcaption>

      <table className="visually-hidden no-report">
        <thead>
          <tr>
            <th>{text.year}</th>
            {SERIES.map((series) => (
              <th key={series.id}>{text[series.labelKey]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((item) => (
            <tr key={item.year}>
              <td>{item.year}</td>
              {lines.map((line, lineIndex) => {
                const change = line.changes[years.indexOf(item)];
                return <td key={lineIndex}>{isNumber(change) ? `${signed(change.toFixed(1), change)}%` : '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
