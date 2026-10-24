import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppHeader } from '../components/Layout';
import CompareMap from '../components/CompareMap';
import { Icon } from '../icons';
import {
  AREAS,
  MAP_LAYERS,
  METRICS_BY_LAYER,
  PALETTES,
  getAnalysisBounds,
  getArea,
  getBaselineOptions,
  getTargetOptions,
} from '../data';
import { fillTemplate } from '../i18n';
import { fetchComparison } from '../services/nasa';
import { getScenePair } from '../services/imagery';
import { useSettings } from '../settings';
import {
  colorAt,
  convertTemperature,
  formatIsoDate,
  formatPercentChange,
  isNumber,
  keepLtr,
  paletteGradient,
  percentChange,
  signed,
  temperatureSymbol,
  toneFor,
  toUnit,
  useAsync,
} from '../utils';

const PICKERS = {
  baseline: { titleKey: 'selectBaselineEpoch', icon: 'history' },
  target: { titleKey: 'selectTargetEpoch', icon: 'satellite' },
};

function EpochCard({ label, year, sensor, icon, variant, isOpen, onOpen }) {
  return (
    <button
      type="button"
      className={`epoch-card epoch-card--${variant}`}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={onOpen}
    >
      <span className="epoch-card__top">
        <span className="label epoch-card__label">{label}</span>
        <span className="epoch-card__icons">
          <Icon name={icon} size={22} />
          <Icon name="chevronDown" size={18} />
        </span>
      </span>
      <span className="epoch-card__value">
        <span className="epoch-card__year">{year}</span>
        <span className="epoch-card__sensor">{sensor}</span>
      </span>
    </button>
  );
}

function EpochOption({ option, icon, isActive, onSelect }) {
  const { strings } = useSettings();
  const className = isActive ? 'epoch-option epoch-option--active' : 'epoch-option';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      disabled={option.disabled}
      className={className}
      onClick={() => onSelect(option.year)}
    >
      <span className="epoch-option__icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="epoch-option__label">
        {option.year} — {strings.epochNames[option.year]}
      </span>
      {isActive && <span className="epoch-option__badge">{strings.active}</span>}
      <span className="epoch-option__radio">
        {isActive && <Icon name="checkCircle" size={22} />}
      </span>
    </button>
  );
}

function EpochSheet({ title, icon, options, selectedYear, onSelect, onClose }) {
  const { strings } = useSettings();
  const titleId = useId();
  const sheetRef = useRef(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    const selected = sheetRef.current?.querySelector('[aria-checked="true"]');
    selected?.focus();

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="epoch-sheet__backdrop" onClick={onClose} />
      <section
        ref={sheetRef}
        className="epoch-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span className="epoch-sheet__grabber" />
        <header className="epoch-sheet__header">
          <h2 id={titleId} className="epoch-sheet__title">
            <span className="status-dot" />
            {title}
          </h2>
          <button type="button" className="epoch-sheet__done" onClick={onClose}>
            {strings.done}
          </button>
        </header>

        <div className="epoch-sheet__list" role="radiogroup" aria-labelledby={titleId}>
          {options.map((option) => (
            <EpochOption
              key={option.year}
              option={option}
              icon={icon}
              isActive={option.year === selectedYear}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function EpochSelector(props) {
  const { baselineYear, targetYear, baselineSensor, targetSensor } = props;
  const { onBaselineChange, onTargetChange } = props;

  const { strings } = useSettings();
  const [openPicker, setOpenPicker] = useState(null);
  const closePicker = useCallback(() => setOpenPicker(null), []);

  let sheet;
  if (openPicker === 'baseline') {
    sheet = {
      options: getBaselineOptions(),
      selectedYear: baselineYear,
      onSelect: onBaselineChange,
    };
  } else {
    sheet = {
      options: getTargetOptions(baselineYear),
      selectedYear: targetYear,
      onSelect: onTargetChange,
    };
  }

  return (
    <>
      <section className="epoch-selector" aria-label={`${strings.baselineEpoch} / ${strings.targetEpoch}`}>
        <EpochCard
          label={strings.baselineEpoch}
          year={baselineYear}
          sensor={baselineSensor}
          icon={PICKERS.baseline.icon}
          variant="baseline"
          isOpen={openPicker === 'baseline'}
          onOpen={() => setOpenPicker('baseline')}
        />
        <span className="epoch-selector__link" aria-hidden="true">
          <Icon name="compare" size={18} />
        </span>
        <EpochCard
          label={strings.targetEpoch}
          year={targetYear}
          sensor={targetSensor}
          icon={PICKERS.target.icon}
          variant="target"
          isOpen={openPicker === 'target'}
          onOpen={() => setOpenPicker('target')}
        />
      </section>

      {openPicker && (
        <EpochSheet
          title={strings[PICKERS[openPicker].titleKey]}
          icon={PICKERS[openPicker].icon}
          options={sheet.options}
          selectedYear={sheet.selectedYear}
          onSelect={sheet.onSelect}
          onClose={closePicker}
        />
      )}
    </>
  );
}

function LayerTabs({ layers, activeId, onChange }) {
  const { strings } = useSettings();

  let activeIndex = layers.findIndex((layer) => layer.id === activeId);
  if (activeIndex < 0) {
    activeIndex = 0;
  }

  return (
    <div
      className="layer-tabs"
      role="tablist"
      aria-label="Map layer"
      style={{ '--active-index': activeIndex }}
    >
      <span className="layer-tabs__indicator" aria-hidden="true" />

      {layers.map((layer) => {
        const isActive = layer.id === activeId;
        const className = isActive ? 'layer-tabs__tab layer-tabs__tab--active' : 'layer-tabs__tab';

        return (
          <button
            key={layer.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={className}
            onClick={() => onChange(layer.id)}
          >
            {layer.icon && <Icon name={layer.icon} size={14} />}
            {strings.layers[layer.id]}
          </button>
        );
      })}
    </div>
  );
}

function formatIndex(value) {
  if (value === 0) {
    return '0.0';
  }
  const sign = value > 0 ? '+' : '−';
  return sign + Math.abs(value).toFixed(2);
}

function formatTemperature(celsius, unit) {
  const value = Math.round(convertTemperature(celsius, unit) * 10) / 10;
  let text = value.toFixed(1);
  if (Number.isInteger(value)) {
    text = String(value);
  }
  return text + temperatureSymbol(unit);
}

function LayerScale({ scale, palette }) {
  const { strings, settings } = useSettings();
  const unit = settings.temperatureUnit;
  const isTemperature = scale.kind === 'temperature';

  function position(value) {
    return ((value - scale.min) / (scale.max - scale.min)) * 100;
  }

  const ticks = scale.ticks.map((tick) => {
    if (isTemperature) {
      return { value: tick, text: formatTemperature(tick, unit) };
    }
    return {
      value: tick.value,
      text: (
        <>
          {formatIndex(tick.value)}{' '}
          <span className="layer-scale__tick-name">{strings.scales[tick.label]}</span>
        </>
      ),
    };
  });

  return (
    <section className={`layer-scale layer-scale--${scale.kind}`} aria-label={strings.scales.ariaLabel}>
      <header className="layer-scale__header">
        {isTemperature &&
          ['min', 'max'].map((end) => (
            <span key={end} className={`layer-scale__end layer-scale__end--${end}`}>
              <span className="layer-scale__dot" style={{ background: colorAt(palette, scale[end]) }} />
              {strings.scales[scale.endLabels[end]]}:{' '}
              <span dir="ltr">{formatTemperature(scale[end], unit)}</span>
            </span>
          ))}

        {!isTemperature && (
          <>
            <span className="layer-scale__title">{strings.scales[scale.title]}</span>
            <span className="layer-scale__formula" dir="ltr">
              {scale.formula}
            </span>
          </>
        )}
      </header>

      <div dir="ltr">
        <span
          className="layer-scale__bar"
          style={{ background: paletteGradient(palette, scale.min, scale.max) }}
        />
        <span className="layer-scale__ticks">
          {ticks.map((tick, index) => {
            const isLast = index === ticks.length - 1;
            const className = isLast ? 'layer-scale__tick layer-scale__tick--last' : 'layer-scale__tick';

            return (
              <span key={tick.value} className={className} style={{ left: `${position(tick.value)}%` }}>
                {tick.text}
              </span>
            );
          })}
        </span>
      </div>
    </section>
  );
}

const NO_VALUE = '—';

const LAND_COVER_VALUES = ['urbanPercent', 'heatIsland'];

function formatHour(hours) {
  const totalMinutes = Math.round(hours * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hour}:${minutes}`;
}

function getValueUnit(metric, symbol) {
  if (!metric.temperature) {
    return metric.unit ?? '';
  }
  if (metric.temperature === 'difference') {
    return '°';
  }
  return symbol;
}

function getCaptionUnit(metric, symbol) {
  if (!metric.temperature) {
    return metric.unit ?? '';
  }
  if (metric.fullUnitInCaption) {
    return symbol;
  }
  return '°';
}

function getIcon(metric, percent, tone) {
  if (metric.icon !== 'trend') {
    return { name: metric.icon, tone: metric.iconTone ?? 'accent' };
  }
  if (percent < 0) {
    return { name: 'trendDown', tone };
  }
  return { name: 'trendUp', tone };
}

function MainValue({ metric, to, percent, unit }) {
  if (metric.display === 'change') {
    if (percent === null) {
      return <span dir="ltr">{NO_VALUE}</span>;
    }
    return (
      <span dir="ltr">
        {signed(percent.toFixed(1), percent)}
        <span className="metric-card__unit">%</span>
      </span>
    );
  }

  if (!isNumber(to)) {
    return NO_VALUE;
  }

  let number = to.toFixed(metric.decimals);
  if (metric.signed) {
    number = signed(number, to);
  }

  return (
    <span dir="ltr">
      {number}
      {unit && <span className="metric-card__unit">{unit}</span>}
    </span>
  );
}

function getChangeText(metric, percent, delta, symbol) {
  if (metric.display === 'change' || metric.change === 'none') {
    return null;
  }
  if (metric.change !== 'temperatureDelta') {
    return formatPercentChange(percent);
  }
  if (delta === null) {
    return NO_VALUE;
  }

  const rounded = Math.round(delta * 10) / 10 || 0;
  return signed(rounded.toFixed(1), rounded) + symbol;
}

function Caption({ metric, from, captionUnit, baseline, target }) {
  const { strings, settings } = useSettings();
  const captionKey = metric.caption ?? 'from';

  if (captionKey === 'night') {
    const night = target.values.heatIslandNight;
    if (!isNumber(night)) {
      return null;
    }
    const value = toUnit(night, metric, settings.temperatureUnit);
    const rounded = Math.round(value * 10) / 10 || 0;
    return (
      <>
        {strings.captions.night} <span dir="ltr">{signed(rounded.toFixed(1), rounded)}°</span>
      </>
    );
  }

  if (captionKey === 'landCoverMap') {
    return fillTemplate(strings.captions.landCoverMap, { year: target.landCoverYear });
  }

  if (captionKey === 'from') {
    if (!isNumber(from)) {
      return null;
    }
    return (
      <>
        {strings.from}{' '}
        <span dir="ltr">
          {from.toFixed(metric.decimals)}
          {captionUnit}
        </span>
      </>
    );
  }

  if (captionKey === 'vsYear') {
    const shortYear = String(baseline.year).slice(-2);
    return fillTemplate(strings.captions.vsYear, { year: baseline.year, shortYear });
  }

  const text = strings.captions[captionKey];
  if (typeof text === 'string') {
    return text;
  }
  return (
    <>
      <span className="tone-accent">{text.highlight}</span> {text.rest}
    </>
  );
}

function MetricCard({ metric, baseline, target }) {
  const { strings, settings } = useSettings();
  const unitChoice = settings.temperatureUnit;
  const symbol = temperatureSymbol(unitChoice);

  const from = toUnit(baseline.values[metric.valueId], metric, unitChoice);
  const to = toUnit(target.values[metric.valueId], metric, unitChoice);

  let percent = null;
  let delta = null;
  if (isNumber(from) && isNumber(to)) {
    percent = percentChange(from, to);
    delta = to - from;
  }

  let tone;
  if (metric.neutral) {
    tone = 'neutral';
  } else if (metric.change === 'temperatureDelta') {
    tone = toneFor(metric, delta);
  } else {
    tone = toneFor(metric, percent);
  }

  const icon = getIcon(metric, percent, tone);
  const changeText = getChangeText(metric, percent, delta, symbol);

  return (
    <article className="metric-card">
      <header className="metric-card__header">
        <h3 className="metric-card__label">{strings.metrics[metric.id]}</h3>
        <Icon name={icon.name} size={20} className={`metric-card__icon tone-${icon.tone}`} />
      </header>

      <p className="metric-card__value">
        <MainValue metric={metric} to={to} percent={percent} unit={getValueUnit(metric, symbol)} />
      </p>

      <p className="metric-card__change">
        {changeText && (
          <>
            <span className={`tone-${tone}`} dir="ltr">
              {changeText}
            </span>{' '}
          </>
        )}
        <Caption
          metric={metric}
          from={from}
          captionUnit={getCaptionUnit(metric, symbol)}
          baseline={baseline}
          target={target}
        />
      </p>
    </article>
  );
}

function Readout({ metrics, comparison, isLoading, sourceNote }) {
  const { strings } = useSettings();
  const isReady = comparison && !isLoading;

  let landCoverNote = '';
  const usesLandCover = metrics.some((metric) => LAND_COVER_VALUES.includes(metric.valueId));
  if (isReady && usesLandCover) {
    const { landCoverYear, year } = comparison.target;
    if (landCoverYear && landCoverYear !== year) {
      landCoverNote = ' · ' + fillTemplate(strings.landCoverYearNote, { year: landCoverYear, target: year });
    }
  }

  let overpassWarning = '';
  const usesTemperature = metrics.some((metric) => metric.temperature);
  if (isReady && usesTemperature) {
    const fromHour = comparison.baseline.values.overpassHour;
    const toHour = comparison.target.values.overpassHour;
    if (fromHour != null && toHour != null && Math.abs(toHour - fromHour) >= 0.5) {
      overpassWarning = fillTemplate(strings.overpassNote, {
        fromYear: comparison.baseline.year,
        toYear: comparison.target.year,
        from: formatHour(fromHour),
        to: formatHour(toHour),
      });
    }
  }

  return (
    <section className="delta-readout" aria-labelledby="delta-readout-title" aria-busy={isLoading}>
      <header className="delta-readout__header">
        <h2 id="delta-readout-title" className="delta-readout__title">
          <Icon name="chart" size={20} className="tone-layer" />
          {strings.deltaReadout}
        </h2>
      </header>

      {isLoading && (
        <p className="delta-readout__loading" role="status">
          {strings.loadingData}
        </p>
      )}

      {isReady && (
        <div className="delta-readout__grid">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              baseline={comparison.baseline}
              target={comparison.target}
            />
          ))}
        </div>
      )}

      {overpassWarning && <p className="delta-readout__warning">{overpassWarning}</p>}

      {isReady && (
        <p className="delta-readout__note">
          {sourceNote}
          {landCoverNote}
        </p>
      )}
    </section>
  );
}

function sceneDate(scene, months) {
  if (scene.period) {
    const [fromYear, fromMonth] = scene.period[0].split('-').map(Number);
    const [toYear, toMonth] = scene.period[1].split('-').map(Number);
    if (fromYear === toYear) {
      return `${months[fromMonth - 1]} – ${months[toMonth - 1]} ${toYear}`;
    }
    return `${months[fromMonth - 1]} ${fromYear} – ${months[toMonth - 1]} ${toYear}`;
  }

  const date = formatIsoDate(scene.date, months);
  if (scene.fillDate) {
    return `${date} + ${formatIsoDate(scene.fillDate, months)}`;
  }
  return date;
}

function getSourceLabel(imagery, strings, showLabels) {
  if (!imagery.data) {
    return '';
  }

  const { baseline, target } = imagery.data;
  const before = fillTemplate(strings.sceneTag, {
    sensor: keepLtr(baseline.source.instrument),
    date: sceneDate(baseline, strings.months),
  });
  const after = fillTemplate(strings.sceneTag, {
    sensor: keepLtr(target.source.instrument),
    date: sceneDate(target, strings.months),
  });
  let label = `${before} / ${after}`;

  if (showLabels) {
    label += ` · ${strings.osmCredit}`;
  }
  return label;
}

function getSensor(scene) {
  if (!scene) {
    return '';
  }
  return `${scene.source.instrument} ${scene.source.platform}`;
}

function getAreaOverlay(area, language, showLabels) {
  const city = AREAS.find((item) => item.kind === 'city');
  const cityName = city.names[language];

  const labels = [
    {
      name: cityName,
      center: city.view.center,
      selected: area.id === city.id,
      city: true,
      deferToReference: showLabels,
    },
  ];

  for (const item of AREAS) {
    if (item.kind !== 'district') continue;

    const isSelected = item.id === area.id;
    if (!isSelected && !showLabels) continue;

    let name = item.names[language];
    if (isSelected) {
      name = `${name} · ${cityName}`;
    }
    labels.push({ name, center: item.view.center, selected: isSelected });
  }

  return { box: getAnalysisBounds(area), labels };
}

export default function ComparePage({ selection }) {
  const { areaId, layerId, setLayerId, baselineYear, targetYear, setBaselineYear, setTargetYear } = selection;
  const { settings, strings } = useSettings();

  const area = getArea(areaId);
  const layer = MAP_LAYERS.find((item) => item.id === layerId);
  const language = settings.language;
  const showLabels = settings.showOverlayLabels;

  const comparison = useAsync(
    () => fetchComparison(areaId, baselineYear, targetYear),
    [areaId, baselineYear, targetYear],
  );
  const imagery = useAsync(
    () => getScenePair(layer.imagery, baselineYear, targetYear),
    [layer.imagery, baselineYear, targetYear],
  );

  const areaOverlay = useMemo(
    () => getAreaOverlay(area, language, showLabels),
    [area, language, showLabels],
  );

  let headerStatus = '';
  if (imagery.data) {
    headerStatus = fillTemplate(strings.orbit, { platform: imagery.data.target.source.platform });
  }

  const baselineTag = `${baselineYear} · ${strings.epochNames[baselineYear]}`;
  let targetTag = `${targetYear} · ${strings.epochNames[targetYear]}`;
  if (layer.scale) {
    targetTag = `${targetYear} · ${strings.layers[layer.id]}`;
  }

  const palette = PALETTES[layer.imagery];
  const boxSize = area.analysis.halfKm * 2;
  const sourceNote = `${strings.dataSources[layer.id]} · ${fillTemplate(strings.analysisBox, { size: boxSize })}`;

  return (
    <div className="compare-page" data-layer={layer.id}>
      <AppHeader statusText={headerStatus} />

      <div className="region-heading">
        <p className="region-heading__eyebrow">
          <span className="status-dot status-dot--blink" />
          {strings.compareEyebrow}
        </p>
        <h2 className="region-heading__title">{area.names[language]}</h2>
      </div>

      <EpochSelector
        baselineYear={baselineYear}
        targetYear={targetYear}
        baselineSensor={getSensor(imagery.data?.baseline)}
        targetSensor={getSensor(imagery.data?.target)}
        onBaselineChange={setBaselineYear}
        onTargetChange={setTargetYear}
      />

      <CompareMap
        key={area.id}
        view={area.view}
        beforeScene={imagery.data?.baseline}
        afterScene={imagery.data?.target}
        beforeLabel={baselineTag}
        afterLabel={targetTag}
        sourceLabel={getSourceLabel(imagery, strings, showLabels)}
        notice={imagery.error ? strings.imageryError : null}
        areaOverlay={areaOverlay}
      />

      {layer.scale && <LayerScale key={layer.id} scale={layer.scale} palette={palette} />}

      <LayerTabs layers={MAP_LAYERS} activeId={layerId} onChange={setLayerId} />

      {comparison.error && (
        <p role="alert" className="page-error">
          {strings.comparisonError}
        </p>
      )}

      {!comparison.error && (
        <Readout
          metrics={METRICS_BY_LAYER[layer.id]}
          comparison={comparison.data}
          isLoading={comparison.isLoading}
          sourceNote={sourceNote}
        />
      )}
    </div>
  );
}
