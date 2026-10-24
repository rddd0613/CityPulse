import { useEffect, useState } from 'react';

export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function signed(text, value) {
  if (value > 0) {
    return '+' + text;
  }
  return text;
}

export function percentChange(from, to) {
  if (from === 0) {
    return null;
  }
  return ((to - from) / Math.abs(from)) * 100;
}

export function formatPercentChange(change) {
  if (change === null) {
    return '—';
  }
  let decimals = 1;
  if (Math.abs(change) >= 100) {
    decimals = 0;
  }
  return signed(change.toFixed(decimals), change) + '%';
}

export function formatIsoDate(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

export function formatCoordinates({ lat, lng }, strings) {
  const { north, south, east, west } = strings.compass;
  const latLetter = lat >= 0 ? north : south;
  const lngLetter = lng >= 0 ? east : west;
  return `${Math.abs(lat).toFixed(2)}°${latLetter} ${Math.abs(lng).toFixed(2)}°${lngLetter}`;
}

export function convertTemperature(celsius, unit) {
  if (unit === 'F') {
    return (celsius * 9) / 5 + 32;
  }
  return celsius;
}

export function temperatureSymbol(unit) {
  if (unit === 'F') {
    return '°F';
  }
  return '°C';
}

export function toUnit(value, metric, unit) {
  if (!isNumber(value) || !metric.temperature) {
    return value;
  }
  if (metric.temperature === 'difference') {
    if (unit === 'F') {
      return (value * 9) / 5;
    }
    return value;
  }
  return convertTemperature(value, unit);
}

export function formatTemperatureChange(celsius, unit) {
  let value = celsius;
  if (unit === 'F') {
    value = (celsius * 9) / 5;
  }

  const rounded = Math.round(value * 10) / 10 || 0;
  return signed(rounded.toFixed(1), rounded) + temperatureSymbol(unit);
}

export function keepLtr(text) {
  return '\u2066' + text + '\u2069';
}

export function toneFor(metric, change) {
  if (!change) {
    return 'neutral';
  }
  const wentUp = change > 0;
  if (wentUp === metric.increaseIsPositive) {
    return 'positive';
  }
  return 'negative';
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbAt(stops, value) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (value <= first.value) {
    return hexToRgb(first.color);
  }
  if (value >= last.value) {
    return hexToRgb(last.color);
  }

  const upper = stops.findIndex((stop) => stop.value >= value);
  const from = stops[upper - 1];
  const to = stops[upper];
  const t = (value - from.value) / (to.value - from.value);
  const a = hexToRgb(from.color);
  const b = hexToRgb(to.color);
  return a.map((c, i) => c + (b[i] - c) * t);
}

export function colorAt(stops, value) {
  const [r, g, b] = rgbAt(stops, value);
  const toHex = (channel) => Math.round(channel).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

export function paletteGradient(stops, from, to, steps = 12) {
  const parts = [];
  for (let i = 0; i <= steps; i += 1) {
    const value = from + ((to - from) * i) / steps;
    const percent = ((i / steps) * 100).toFixed(1);
    parts.push(`${colorAt(stops, value)} ${percent}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function useAsync(load, deps) {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  useEffect(() => {
    let isCurrent = true;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    load()
      .then((data) => {
        if (isCurrent) setState({ data, error: null, isLoading: false });
      })
      .catch((error) => {
        if (isCurrent) setState({ data: null, error, isLoading: false });
      });

    return () => {
      isCurrent = false;
    };
  }, deps);

  return state;
}

export function simplifyArabic(text) {
  return text
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}
