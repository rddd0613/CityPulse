import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AppHeader } from '../components/Layout';
import { getLayerList, switchLayers } from '../components/CompareMap';
import { Icon } from '../icons';
import { AREAS, EPOCHS, MAP_LAYERS, getArea } from '../data';
import { fillTemplate } from '../i18n';
import { getScene } from '../services/imagery';
import { useSettings } from '../settings';
import { simplifyArabic, useAsync } from '../utils';

const LATEST_YEAR = EPOCHS[EPOCHS.length - 1];
const MAX_RESULTS = 6;
const CITY = AREAS.find((area) => area.kind === 'city');

function searchAreas(query) {
  const wanted = simplifyArabic(query);
  if (!wanted) return [];

  return AREAS.filter((area) => {
    const names = [area.names.en, area.names.ar].map(simplifyArabic);
    return names.some((name) => name.includes(wanted));
  }).slice(0, MAX_RESULTS);
}

function SearchBar({ selected, onFound }) {
  const { strings, settings } = useSettings();
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const text = strings.explore;
  const results = isTyping ? searchAreas(query) : [];

  function pick(area) {
    onFound(area.id);
    setQuery(area.names[settings.language]);
    setIsTyping(false);
  }

  function onChange(event) {
    setQuery(event.target.value);
    setIsTyping(true);
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && results.length > 0) {
      pick(results[0]);
    }
    if (event.key === 'Escape') {
      setIsTyping(false);
    }
  }

  return (
    <div className="area-search">
      <label className="area-search__box">
        <Icon name="search" size={18} />
        <input
          className="area-search__input"
          type="search"
          value={isTyping || !selected ? query : selected.names[settings.language]}
          placeholder={text.searchPlaceholder}
          aria-label={text.searchPlaceholder}
          onFocus={(event) => event.target.select()}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      </label>

      {isTyping && query.trim() && (
        <ul className="area-search__results">
          {results.length === 0 && <li className="area-search__empty">{text.noResults}</li>}
          {results.map((area) => (
            <li key={area.id}>
              <button type="button" className="area-search__result" onClick={() => pick(area)}>
                <Icon name={area.kind === 'city' ? 'locationCity' : 'location'} size={16} />
                {area.names[settings.language]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveMap({ area, scene }) {
  const view = area?.view ?? CITY.view;
  const { settings } = useSettings();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const labelRef = useRef(null);

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: view.center,
      zoom: view.zoom,
      minZoom: view.minZoom,
      maxZoom: view.maxZoom,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      layersRef.current = [];
    };
  }, []);

  useEffect(() => {
    labelRef.current?.remove();
    if (!area) return;

    mapRef.current.flyTo(area.view.center, area.view.zoom);

    const label = document.createElement('span');
    label.textContent = area.names[settings.language];
    labelRef.current = L.marker(area.view.center, {
      icon: L.divIcon({ className: 'explore-card__label', html: label, iconSize: null }),
      interactive: false,
      keyboard: false,
    }).addTo(mapRef.current);
  }, [area, settings.language]);

  useEffect(() => {
    const list = getLayerList(scene, settings.heatMapOpacity / 100);
    layersRef.current = switchLayers(mapRef.current, layersRef.current, list, 'tilePane');
  }, [scene, settings.heatMapOpacity]);

  return <div ref={containerRef} className="explore-card__map" />;
}

export default function ExplorePage({ selection, onNavigate }) {
  const { strings } = useSettings();
  const { pickedAreaId, setAreaId, layerId } = selection;
  const text = strings.explore;

  const area = pickedAreaId ? getArea(pickedAreaId) : null;
  const layer = MAP_LAYERS.find((item) => item.id === layerId);
  const scene = useAsync(() => getScene(layer.imagery, LATEST_YEAR), [layer.imagery]);

  let headerStatus = '';
  if (scene.data) {
    headerStatus = fillTemplate(strings.orbit, { platform: scene.data.source.platform });
  }

  return (
    <>
      <AppHeader statusText={headerStatus} />

      <div className="page-intro">
        <h2 className="page-intro__title">{text.title}</h2>
        <p className="page-intro__text">{text.intro}</p>
      </div>

      <SearchBar selected={area} onFound={setAreaId} />

      <section className="explore-card">
        <LiveMap area={area} scene={scene.data} />

        <span className="explore-card__tag">
          <span className="insights-hero__dot" />
          {text.tags[layer.id]}
        </span>

        <button type="button" className="explore-card__compare" onClick={() => onNavigate('compare')}>
          <Icon name="compare" size={16} />
          {strings.nav.compare}
        </button>
      </section>
    </>
  );
}
