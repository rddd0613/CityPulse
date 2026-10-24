import { AppHeader } from '../components/Layout';
import { Icon } from '../icons';
import { MAP_LAYERS, PALETTES } from '../data';
import { useSettings } from '../settings';
import { paletteGradient } from '../utils';

const NATURAL_COLORS = 'linear-gradient(90deg, #3a5a40, #a8956a, #6b8fb5)';

const DATA_LAYERS = [
  { id: 'thermal-ir', meta: 'Aqua • MODIS • 1 km' },
  { id: 'ndvi', meta: 'Landsat 8 • OLI • 30 m' },
  { id: 'true-radiance', meta: 'Landsat 8 / Sentinel-2 • 30 m' },
];

const SATELLITES = [
  { id: 'landsat', name: 'Landsat 8 (OLI)' },
  { id: 'sentinel', name: 'Sentinel-2 (MSI)' },
  { id: 'modis', name: 'Aqua (MODIS)' },
];

function layerGradient(id) {
  const layer = MAP_LAYERS.find((item) => item.id === id);
  if (!layer.scale) {
    return NATURAL_COLORS;
  }
  return paletteGradient(PALETTES[layer.imagery], layer.scale.min, layer.scale.max);
}

export default function DataPage({ selection, onNavigate }) {
  const { strings } = useSettings();
  const { layerId, setLayerId } = selection;
  const text = strings.dataCenter;

  function showOnMap(id) {
    setLayerId(id);
    onNavigate('explore');
  }

  return (
    <>
      <AppHeader />

      <div className="page-intro">
        <h2 className="page-intro__title">{text.title}</h2>
        <p className="page-intro__text">{text.intro}</p>
      </div>

      <div className="page-body">
        <p className="data-note">
          <Icon name="orbit" size={19} />
          {text.coverage}
        </p>

        <h3 className="page-section">{text.layersTitle}</h3>
        {DATA_LAYERS.map((layer) => {
          const about = text.layers[layer.id];
          const className = layer.id === layerId ? 'data-layer data-layer--active' : 'data-layer';

          return (
            <article key={layer.id} className={className}>
              <header className="data-layer__header">
                <h4 className="data-layer__name">{about.name}</h4>
                <span className="data-layer__badge">{text.since}</span>
              </header>
              <p className="data-layer__about">{about.description}</p>
              <div className="data-layer__scale" style={{ background: layerGradient(layer.id) }} />
              <div className="data-layer__ends" dir="ltr">
                <span>{about.low}</span>
                <span>{about.high}</span>
              </div>
              <footer className="data-layer__footer">
                <bdi className="data-layer__meta">{layer.meta}</bdi>
                <button type="button" className="data-layer__button" onClick={() => showOnMap(layer.id)}>
                  {text.viewOnMap}
                </button>
              </footer>
            </article>
          );
        })}

        <h3 className="page-section">{text.satellitesTitle}</h3>
        {SATELLITES.map((satellite) => (
          <article key={satellite.id} className="data-satellite">
            <span className="data-satellite__icon">
              <Icon name="orbit" size={22} />
            </span>
            <div>
              <h4 className="data-satellite__name">
                <bdi>{satellite.name}</bdi>
              </h4>
              <p className="data-satellite__about">{text.satellites[satellite.id]}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
