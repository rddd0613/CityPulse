import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AppHeader } from '../components/Layout';
import { createTileLayer } from '../components/CompareMap';
import { ReportDocument, downloadPdfReport } from '../components/Report';
import TrajectoryChart from '../components/TrajectoryChart';
import { Icon } from '../icons';
import { EPOCHS, getAnalysisBounds, getArea } from '../data';
import { STRINGS, fillTemplate } from '../i18n';
import { fetchComparison, fetchTrajectory } from '../services/nasa';
import { getScene, getScenePair } from '../services/imagery';
import { useSettings } from '../settings';
import {
  convertTemperature,
  formatIsoDate,
  formatPercentChange,
  formatTemperatureChange,
  isNumber,
  keepLtr,
  percentChange,
  signed,
  temperatureSymbol,
  useAsync,
} from '../utils';

function shortPlatform(platform) {
  return platform.replace('Landsat ', 'L').replace('Sentinel-', 'S');
}

function toneOf(change, increaseIsGood) {
  if (!change) return 'neutral';
  if (change > 0 === increaseIsGood) return 'positive';
  return 'negative';
}

function AreaCard({ area }) {
  const { strings, settings } = useSettings();

  return (
    <div className="insights-area">
      <span className="insights-area__icon">
        <Icon name="location" size={20} />
      </span>
      <span className="insights-area__text">
        <span className="insights-area__label">{strings.insights.areaLabel}</span>
        <span className="insights-area__name">{area.names[settings.language]}</span>
      </span>
    </div>
  );
}

function HeroMap({ area, scene, heatIsland }) {
  const { strings, settings, direction } = useSettings();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const text = strings.insights;

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: area.view.center,
      zoom: area.view.zoom,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    mapRef.current = map;

    L.rectangle(getAnalysisBounds(area), { className: 'area-box', interactive: false }).addTo(map);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !scene) return;

    const layers = [];
    for (const tile of scene.tiles) {
      const layer = createTileLayer(map, tile, 'tilePane');
      layer.setOpacity(1);
      layers.push(layer);
    }

    return () => {
      for (const layer of layers) {
        layer.remove();
      }
    };
  }, [scene]);

  let sourceTag = null;
  if (scene) {
    sourceTag = (
      <>
        {scene.source.instrument} · <bdi>{formatIsoDate(scene.date, strings.months)}</bdi>
      </>
    );
  }

  return (
    <figure className="insights-hero">
      <div ref={containerRef} className="insights-hero__map" />

      {sourceTag && (
        <span className="insights-hero__tag insights-hero__tag--source" dir={direction}>
          <span className="insights-hero__dot" />
          {sourceTag}
        </span>
      )}

      {isNumber(heatIsland) && (
        <span className="insights-hero__tag insights-hero__tag--gradient">
          {fillTemplate(text.thermalGradient, { value: '' })}
          <span dir="ltr">{formatTemperatureChange(heatIsland, settings.temperatureUnit)}</span>
        </span>
      )}

      <figcaption className="insights-hero__caption">
        <span className="insights-hero__caption-text">
          <span className="insights-hero__dot" />
          {text.heroCaption}
        </span>
        <span className="insights-hero__resolution">{text.heroResolution}</span>
      </figcaption>
    </figure>
  );
}

function StatCard({ tone, icon, label, value, unit, badge, badgeTone }) {
  return (
    <article className={`insights-stat insights-stat--${tone}`}>
      <header className="insights-stat__header">
        <h3 className="insights-stat__label">{label}</h3>
        <Icon name={icon} size={20} className="insights-stat__icon" />
      </header>
      <p className="insights-stat__value" dir="ltr">
        {value}
        <span className="insights-stat__unit">{unit}</span>
      </p>
      {badge && (
        <span className={`insights-stat__badge insights-stat__badge--${badgeTone}`} dir="ltr">
          {badge}
        </span>
      )}
    </article>
  );
}

function StatCards({ comparison }) {
  const { strings, settings } = useSettings();
  const text = strings.insights;
  const unit = settings.temperatureUnit;

  const before = comparison.baseline.values;
  const after = comparison.target.values;
  const noValue = '—';

  let heatValue = noValue;
  let heatBadge = null;
  let heatChange = null;
  if (isNumber(after.lstDay)) {
    heatValue = convertTemperature(after.lstDay, unit).toFixed(1);
  }
  if (isNumber(before.lstDay) && isNumber(after.lstDay)) {
    heatChange = after.lstDay - before.lstDay;
    const percent = percentChange(before.lstDay, after.lstDay);
    heatBadge = `${formatTemperatureChange(heatChange, unit)} (${formatPercentChange(percent)})`;
  }

  let canopyValue = noValue;
  let canopyBadge = null;
  let canopyChange = null;
  if (isNumber(after.ndvi)) {
    canopyValue = after.ndvi.toFixed(2);
  }
  if (isNumber(before.ndvi) && isNumber(after.ndvi)) {
    canopyChange = percentChange(before.ndvi, after.ndvi);
    if (canopyChange !== null) {
      canopyBadge = `${formatPercentChange(canopyChange)} ${text.net}`;
    }
  }

  let builtValue = noValue;
  if (isNumber(after.urbanPercent)) {
    builtValue = Math.round(after.urbanPercent);
  }
  const builtBadge = fillTemplate(text.landCoverMap, { year: comparison.target.landCoverYear });

  return (
    <div className="insights-stats">
      <StatCard
        tone="heat"
        icon="thermometer"
        label={text.surfaceHeat}
        value={heatValue}
        unit={temperatureSymbol(unit)}
        badge={heatBadge}
        badgeTone={toneOf(heatChange, false)}
      />
      <StatCard
        tone="canopy"
        icon="eco"
        label={text.canopy}
        value={canopyValue}
        unit="idx"
        badge={canopyBadge}
        badgeTone={toneOf(canopyChange, true)}
      />
      <StatCard
        tone="built"
        icon="building"
        label={text.builtUp}
        value={builtValue}
        unit="%"
        badge={builtBadge}
        badgeTone="accent"
      />
    </div>
  );
}

function getFindings(comparison, areaName, strings, unit) {
  const text = strings.insights;
  const before = comparison.baseline.values;
  const after = comparison.target.values;
  const fromYear = comparison.baseline.year;
  const toYear = comparison.target.year;
  const findings = [];

  if (isNumber(before.lstDay) && isNumber(after.lstDay)) {
    const change = after.lstDay - before.lstDay;
    const delta = formatTemperatureChange(change, unit);
    findings.push({
      icon: 'fire',
      tone: change > 0 ? 'negative' : 'positive',
      title: change > 0 ? text.heatUpTitle : text.heatDownTitle,
      badge: delta,
      text: fillTemplate(text.heatText, {
        area: areaName,
        direction: change > 0 ? text.rose : text.fell,
        delta: keepLtr(delta),
        from: fromYear,
        to: toYear,
      }),
    });
  }

  if (isNumber(before.ndvi) && isNumber(after.ndvi)) {
    const change = after.ndvi - before.ndvi;
    findings.push({
      icon: 'tree',
      tone: change >= 0 ? 'positive' : 'negative',
      title: change >= 0 ? text.greenUpTitle : text.greenDownTitle,
      badge: `${signed(change.toFixed(2), change)} NDVI`,
      text: fillTemplate(text.greenText, {
        fromValue: before.ndvi.toFixed(2),
        toValue: after.ndvi.toFixed(2),
        fromArea: before.greenCoverKm2.toFixed(1),
        toArea: after.greenCoverKm2.toFixed(1),
      }),
    });
  }

  if (isNumber(before.diurnalRange) && isNumber(after.diurnalRange)) {
    const change = after.diurnalRange - before.diurnalRange;

    function toDegrees(celsius) {
      let value = celsius;
      if (unit === 'F') {
        value = (celsius * 9) / 5;
      }
      return keepLtr(value.toFixed(1) + '°');
    }
    let night = '—';
    if (isNumber(after.heatIslandNight)) {
      night = keepLtr(formatTemperatureChange(after.heatIslandNight, unit));
    }
    findings.push({
      icon: 'landscape',
      tone: 'accent',
      title: change < 0 ? text.nightDownTitle : text.nightUpTitle,
      badge: `${formatTemperatureChange(change, unit)} ${text.nightBadge}`,
      text: fillTemplate(text.nightText, {
        fromValue: toDegrees(before.diurnalRange),
        toValue: toDegrees(after.diurnalRange),
        night,
        year: toYear,
      }),
    });
  }

  return findings;
}

function Findings({ findings }) {
  return (
    <div className="insights-findings">
      {findings.map((finding) => (
        <article key={finding.icon} className="insights-finding">
          <span className={`insights-finding__icon insights-finding__icon--${finding.tone}`}>
            <Icon name={finding.icon} size={20} />
          </span>
          <div className="insights-finding__body">
            <header className="insights-finding__header">
              <h3 className="insights-finding__title">{finding.title}</h3>
              <span className={`insights-finding__badge tone-${finding.tone}`} dir="ltr">
                {finding.badge}
              </span>
            </header>
            <p className="insights-finding__text">{finding.text}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function InsightsPage({ selection }) {
  const { areaId, baselineYear, targetYear } = selection;
  const { settings, strings } = useSettings();
  const text = strings.insights;
  const area = getArea(areaId);
  const areaName = area.names[settings.language];
  const [isCopied, setIsCopied] = useState(false);
  const [isMakingPdf, setIsMakingPdf] = useState(false);
  const reportRef = useRef(null);

  const comparison = useAsync(
    () => fetchComparison(areaId, baselineYear, targetYear),
    [areaId, baselineYear, targetYear],
  );
  const heroScene = useAsync(() => getScene('trueColor', targetYear), [targetYear]);
  const photos = useAsync(() => getScenePair('trueColor', baselineYear, targetYear), [baselineYear, targetYear]);

  const comparisonReady = Boolean(comparison.data) && !comparison.isLoading;
  const trajectory = useAsync(() => {
    if (!comparisonReady) {
      return Promise.resolve(null);
    }
    return fetchTrajectory(areaId, EPOCHS);
  }, [areaId, comparisonReady]);

  let headerStatus = '';
  if (heroScene.data) {
    headerStatus = fillTemplate(strings.orbit, { platform: heroScene.data.source.platform });
  }

  let sensors = '—';
  if (photos.data) {
    const before = shortPlatform(photos.data.baseline.source.platform);
    const after = shortPlatform(photos.data.target.source.platform);
    sensors = `${before} / ${after}`;
  }

  let findings = [];
  if (comparison.data && !comparison.isLoading) {
    findings = getFindings(comparison.data, areaName, strings, settings.temperatureUnit);
  }

  let reportFindings = [];
  if (comparison.data && !comparison.isLoading) {
    reportFindings = getFindings(comparison.data, area.names.en, STRINGS.en, settings.temperatureUnit);
  }

  useEffect(() => {
    if (!isMakingPdf || !reportRef.current) return;

    async function makePdf() {
      try {
        const fileName = `city-pulse-${area.id}-${baselineYear}-${targetYear}.pdf`;
        const pageLabel = (page, total) => fillTemplate(STRINGS.en.report.page, { page, total });
        await downloadPdfReport(reportRef.current, fileName, pageLabel);
      } catch (error) {
        console.error('Could not make the PDF report', error);
      }
      setIsMakingPdf(false);
    }

    requestAnimationFrame(makePdf);
  }, [isMakingPdf, area.id, baselineYear, targetYear]);

  function share() {
    const url = window.location.href;

    if (navigator.share) {
      navigator.share({ title: `${strings.appName} · ${text.title}`, url }).catch(() => {});
      return;
    }

    navigator.clipboard
      .writeText(url)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="insights-page">
      <AppHeader statusText={headerStatus} />

      <h2 className="insights-page__title">{text.title}</h2>

      <AreaCard area={area} />

      <div className="insights-pills">
        <div className="insights-pill">
          <Icon name="history" size={22} className="insights-pill__icon insights-pill__icon--accent" />
          <span>
            <span className="insights-pill__value" dir="ltr">
              {baselineYear} — {targetYear}
            </span>
            <span className="insights-pill__label">
              {fillTemplate(text.span, { years: targetYear - baselineYear })}
            </span>
          </span>
        </div>
        <div className="insights-pill">
          <Icon name="satellite" size={22} className="insights-pill__icon insights-pill__icon--positive" />
          <span>
            <span className="insights-pill__value" dir="ltr">
              {sensors}
            </span>
            <span className="insights-pill__label">{text.sensors}</span>
          </span>
        </div>
      </div>

      <HeroMap
        key={area.id}
        area={area}
        scene={heroScene.data}
        heatIsland={comparison.data?.target.values.heatIsland}
      />

      {comparison.isLoading && (
        <p className="insights-page__status" role="status">
          {text.loading}
        </p>
      )}
      {comparison.error && (
        <p className="page-error" role="alert">
          {text.error}
        </p>
      )}
      {comparison.data && !comparison.isLoading && <StatCards comparison={comparison.data} />}

      <section className="insights-card">
        <header className="insights-card__header">
          <h2 className="insights-card__title">{text.trajectory}</h2>
          <span className="insights-card__range" dir="ltr">
            {EPOCHS[0]} — {EPOCHS[EPOCHS.length - 1]}
          </span>
        </header>
        {trajectory.data && <TrajectoryChart years={trajectory.data} />}
        {!trajectory.data && <p className="insights-page__status">{text.loading}</p>}
      </section>

      <h2 className="insights-page__section">{text.findings}</h2>
      {findings.length > 0 && <Findings findings={findings} />}

      <div className="insights-actions no-report">
        <button
          type="button"
          className="insights-actions__download"
          onClick={() => setIsMakingPdf(true)}
          disabled={isMakingPdf || findings.length === 0 || !trajectory.data}
        >
          <Icon name="pdf" size={20} />
          {isMakingPdf ? text.preparing : text.download}
        </button>
        <button type="button" className="insights-actions__share" aria-label={text.share} onClick={share}>
          <Icon name="share" size={20} />
        </button>
        {isCopied && (
          <span className="insights-actions__toast" role="status">
            {text.linkCopied}
          </span>
        )}
      </div>

      {isMakingPdf && (
        <div className="report-stage" aria-hidden="true">
          <ReportDocument
            ref={reportRef}
            area={area}
            comparison={comparison.data}
            trajectory={trajectory.data}
            findings={reportFindings}
          />
        </div>
      )}
    </div>
  );
}
