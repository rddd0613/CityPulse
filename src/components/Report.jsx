import { forwardRef } from 'react';
import html2canvas from 'html2canvas';
import TrajectoryChart from './TrajectoryChart';
import { STRINGS, fillTemplate } from '../i18n';
import { useSettings } from '../settings';
import {
  convertTemperature,
  formatIsoDate,
  formatPercentChange,
  formatTemperatureChange,
  isNumber,
  percentChange,
  temperatureSymbol,
} from '../utils';

const NO_VALUE = '—';

function formatDegrees(celsius, unit) {
  let value = celsius;
  if (unit === 'F') {
    value = (celsius * 9) / 5;
  }
  return value.toFixed(1) + '°';
}

function getRow(label, before, after, options, unit) {
  const { kind, decimals = 1, suffix = '', showChange = true } = options;

  function format(value) {
    if (!isNumber(value)) return NO_VALUE;
    if (kind === 'temperature') {
      return convertTemperature(value, unit).toFixed(1) + temperatureSymbol(unit);
    }
    if (kind === 'difference') {
      return formatDegrees(value, unit);
    }
    return value.toFixed(decimals) + suffix;
  }

  let change = NO_VALUE;
  if (showChange && isNumber(before) && isNumber(after)) {
    if (kind === 'temperature' || kind === 'difference') {
      change = formatTemperatureChange(after - before, unit);
    } else {
      change = formatPercentChange(percentChange(before, after));
    }
  }

  return { label, before: format(before), after: format(after), change };
}

export const ReportDocument = forwardRef(function ReportDocument({ area, comparison, trajectory, findings }, ref) {
  const { settings } = useSettings();
  const strings = STRINGS.en;
  const text = strings.report;
  const unit = settings.temperatureUnit;

  const before = comparison.baseline.values;
  const after = comparison.target.values;
  const fromYear = comparison.baseline.year;
  const toYear = comparison.target.year;
  const today = formatIsoDate(new Date().toISOString().slice(0, 10), strings.months);

  const rows = [
    getRow(text.surfaceTemp, before.lstDay, after.lstDay, { kind: 'temperature' }, unit),
    getRow(text.nightCooling, before.diurnalRange, after.diurnalRange, { kind: 'difference' }, unit),
    getRow(text.heatIsland, before.heatIsland, after.heatIsland, { kind: 'difference' }, unit),
    getRow(text.heatIslandNight, before.heatIslandNight, after.heatIslandNight, { kind: 'difference' }, unit),
    getRow(text.ndvi, before.ndvi, after.ndvi, { decimals: 2 }, unit),
    getRow(text.greenCover, before.greenCoverKm2, after.greenCoverKm2, { decimals: 1, suffix: ' km²' }, unit),
    getRow(text.bareLand, before.bareLandKm2, after.bareLandKm2, { decimals: 1, suffix: ' km²' }, unit),
    getRow(text.builtUp, before.urbanPercent, after.urbanPercent, { decimals: 0, suffix: '%', showChange: false }, unit),
  ];

  const boxSize = area.analysis.halfKm * 2;

  return (
    <article ref={ref} className="report-doc" dir="ltr" lang="en">
      <header className="report-doc__section report-doc__header">
        <p className="report-doc__brand">City Pulse</p>
        <h1 className="report-doc__title">{text.title}</h1>
        <dl className="report-doc__meta">
          <div>
            <dt>{text.area}</dt>
            <dd>{area.names.en}</dd>
          </div>
          <div>
            <dt>{text.period}</dt>
            <dd dir="ltr">
              {fromYear} – {toYear}
            </dd>
          </div>
          <div>
            <dt>{text.generated}</dt>
            <dd>{today}</dd>
          </div>
          <div>
            <dt>{text.source}</dt>
            <dd>{text.sourceValue}</dd>
          </div>
        </dl>
      </header>

      <section className="report-doc__section">
        <h2 className="report-doc__heading">{text.summary}</h2>
        <ul className="report-doc__findings">
          {findings.map((finding) => (
            <li key={finding.icon}>
              <strong>{finding.title}.</strong> {finding.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="report-doc__section">
        <h2 className="report-doc__heading">{text.indicators}</h2>
        <table className="report-doc__table">
          <thead>
            <tr>
              <th>{text.indicator}</th>
              <th>{fromYear}</th>
              <th>{toYear}</th>
              <th>{text.change}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td dir="ltr">{row.before}</td>
                <td dir="ltr">{row.after}</td>
                <td dir="ltr">{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {trajectory && (
        <section className="report-doc__section">
          <h2 className="report-doc__heading">{text.trend}</h2>
          <TrajectoryChart years={trajectory} strings={strings} />
          <table className="report-doc__table report-doc__table--years">
            <thead>
              <tr>
                <th>{text.year}</th>
                <th>{text.surfaceTemp}</th>
                <th>{text.ndvi}</th>
                <th>{text.builtUp}</th>
              </tr>
            </thead>
            <tbody>
              {trajectory.map((item) => {
                const values = item.values;
                let temperature = NO_VALUE;
                if (isNumber(values.lstDay)) {
                  temperature = convertTemperature(values.lstDay, unit).toFixed(1) + temperatureSymbol(unit);
                }
                return (
                  <tr key={item.year}>
                    <td>{item.year}</td>
                    <td dir="ltr">{temperature}</td>
                    <td dir="ltr">{isNumber(values.ndvi) ? values.ndvi.toFixed(2) : NO_VALUE}</td>
                    <td dir="ltr">{isNumber(values.urbanPercent) ? Math.round(values.urbanPercent) + '%' : NO_VALUE}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="report-doc__section">
        <h2 className="report-doc__heading">{text.methods}</h2>
        <ul className="report-doc__notes">
          <li>{text.methodLst}</li>
          <li>{text.methodNdvi}</li>
          <li>{text.methodUrbanRural}</li>
          <li>{text.methodLandCover}</li>
          <li>{fillTemplate(text.methodBox, { size: boxSize })}</li>
          <li>{text.methodLimits}</li>
          <li>{text.methodService}</li>
        </ul>
      </section>
    </article>
  );
});

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const WHITE = [255, 255, 255];
const SCALE = 2;
const TOP_SPACE = 48;
const FOOTER_SPACE = 48;

function textBytes(text) {
  return new TextEncoder().encode(text);
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildPdf(pages) {
  const chunks = [];
  const offsets = [];
  let length = 0;

  function write(part) {
    const bytes = typeof part === 'string' ? textBytes(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  }

  function startObject(id) {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
  }

  const pageIds = pages.map((_, i) => 3 + i * 3);

  write('%PDF-1.4\n');

  startObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const imageId = pageId + 1;
    const contentId = pageId + 2;

    startObject(pageId);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /XObject << /Im${i} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    startObject(imageId);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    );
    write(page.jpeg);
    write('\nendstream\nendobj\n');

    const drawing = `q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im${i} Do Q\n`;
    startObject(contentId);
    write(`<< /Length ${textBytes(drawing).length} >>\nstream\n${drawing}endstream\nendobj\n`);
  });

  const objectCount = 3 + pages.length * 3;
  const indexStart = length;
  write(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < objectCount; id += 1) {
    write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${indexStart}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

function nextCut(start, maxHeight, cutPoints, total) {
  const limit = start + maxHeight;
  if (limit >= total) {
    return total;
  }
  let cut = limit;
  for (const point of cutPoints) {
    if (point > start && point <= limit) {
      cut = point;
    }
  }
  return cut;
}

function makePages(canvas, cutPoints, contentEnd, pageLabel) {
  const pageHeight = Math.round(canvas.width * (PAGE_HEIGHT / PAGE_WIDTH));
  const topSpace = TOP_SPACE * SCALE;
  const footerSpace = FOOTER_SPACE * SCALE;

  const ranges = [];
  let y = 0;
  while (y < contentEnd) {
    const space = pageHeight - footerSpace - (ranges.length === 0 ? 0 : topSpace);
    const cut = nextCut(y, space, cutPoints, contentEnd);
    ranges.push({ from: y, to: cut });
    y = cut;
  }

  return ranges.map((range, index) => {
    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = pageHeight;

    const context = page.getContext('2d');
    context.fillStyle = `rgb(${WHITE.join(',')})`;
    context.fillRect(0, 0, page.width, page.height);

    const offset = index === 0 ? 0 : topSpace;
    const height = range.to - range.from;
    context.drawImage(canvas, 0, range.from, canvas.width, height, 0, offset, canvas.width, height);

    context.fillStyle = '#8b8e95';
    context.font = `${11 * SCALE}px "Space Grotesk", sans-serif`;
    context.textAlign = 'center';
    context.fillText(pageLabel(index + 1, ranges.length), page.width / 2, page.height - footerSpace / 2);

    return {
      jpeg: dataUrlToBytes(page.toDataURL('image/jpeg', 0.92)),
      width: page.width,
      height: page.height,
    };
  });
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function downloadPdfReport(element, fileName, pageLabel) {
  const top = element.getBoundingClientRect().top;

  const cutPoints = [];
  const sections = element.querySelectorAll('.report-doc__section');
  for (let i = 0; i < sections.length - 1; i += 1) {
    const bottom = sections[i].getBoundingClientRect().bottom - top;
    const nextTop = sections[i + 1].getBoundingClientRect().top - top;
    cutPoints.push(Math.round(((bottom + nextTop) / 2) * SCALE));
  }
  for (const item of element.querySelectorAll('tr, li')) {
    const bottom = item.getBoundingClientRect().bottom - top;
    cutPoints.push(Math.round(bottom * SCALE));
  }

  const canvas = await html2canvas(element, {
    backgroundColor: `rgb(${WHITE.join(',')})`,
    scale: SCALE,
    ignoreElements: (node) => node.classList?.contains('visually-hidden'),
  });

  const lastSection = sections[sections.length - 1];
  const contentEnd = Math.min(canvas.height, Math.round((lastSection.getBoundingClientRect().bottom - top) * SCALE));
  const pages = makePages(canvas, cutPoints, contentEnd, pageLabel);
  download(buildPdf(pages), fileName);
}
