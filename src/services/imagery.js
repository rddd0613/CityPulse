import { PALETTES, SCENES } from '../data';
import { rgbAt } from '../utils';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const PLANETARY = 'https://planetarycomputer.microsoft.com/api/data/v1';

const SOURCES = {

  hlsL30: {
    layerId: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance',
    tileMatrixSet: 'GoogleMapsCompatible_Level12',
    maxNativeZoom: 12,
    platform: 'Landsat 8',
    instrument: 'OLI',
  },
  hlsS30: {
    layerId: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance',
    tileMatrixSet: 'GoogleMapsCompatible_Level12',
    maxNativeZoom: 12,
    platform: 'Sentinel-2',
    instrument: 'MSI',
  },

  modisAquaLst: {
    layerId: 'MODIS_Aqua_L3_Land_Surface_Temp_8Day_Day',
    tileMatrixSet: 'GoogleMapsCompatible_Level7',
    maxNativeZoom: 7,
    zoomLimit: 12,
    platform: 'Aqua',
    instrument: 'MODIS',
  },
  landsatNdvi: {
    planetary: true,
    layerId: 'landsat-ndvi',
    maxNativeZoom: 12,
    platform: 'Landsat 8',
    instrument: 'OLI',
  },
};

const BASEMAPS = {
  landSurfaceTemperature: 'trueColor',
};

export const REFERENCE_OVERLAY = [
  {
    layerId: 'Reference_Features',
    tileUrl: `${GIBS}/Reference_Features/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
    maxNativeZoom: 9,
  },
  {
    layerId: 'Reference_Labels',
    tileUrl: `${GIBS}/Reference_Labels/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
    maxNativeZoom: 9,
  },
];

function cached(cache, key, load) {
  if (!cache.has(key)) {
    const request = load();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key);
}

function gibsTileUrl(source, date) {
  return `${GIBS}/${source.layerId}/default/${date}/${source.tileMatrixSet}/{z}/{y}/{x}.png`;
}

const NDVI_EXPRESSION = '(nir08-red)*0.0000275/((nir08+red)*0.0000275-0.4)';

function makeNdviColormap() {
  function colour(value) {
    const [r, g, b] = rgbAt(PALETTES.ndvi, value);
    return [Math.round(r), Math.round(g), Math.round(b), 255];
  }

  const steps = [[[-1, 0], colour(0)]];
  for (let i = 0; i < 32; i += 1) {
    const from = i / 32;
    const to = (i + 1) / 32;
    steps.push([[from, to], colour((from + to) / 2)]);
  }
  return JSON.stringify(steps);
}

const NDVI_QUERY = [
  'collection=landsat-c2-l2',
  'assets=red',
  'assets=nir08',
  'asset_as_band=true',
  'expression=' + encodeURIComponent(NDVI_EXPRESSION),
  'nodata=0',

  'pixel_selection=median',
  'colormap=' + encodeURIComponent(makeNdviColormap()),
].join('&');

const RIYADH_POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [46.35, 24.45],
      [47.05, 24.45],
      [47.05, 25.05],
      [46.35, 25.05],
      [46.35, 24.45],
    ],
  ],
};

const ndviMosaics = new Map();

function getNdviTileUrl(period) {
  const [start, end] = period;

  const search = {
    'filter-lang': 'cql2-json',
    filter: {
      op: 'and',
      args: [
        { op: '=', args: [{ property: 'collection' }, 'landsat-c2-l2'] },
        { op: '=', args: [{ property: 'platform' }, 'landsat-8'] },
        { op: 's_intersects', args: [{ property: 'geometry' }, RIYADH_POLYGON] },
        {
          op: 'anyinteracts',
          args: [{ property: 'datetime' }, { interval: [`${start}T00:00:00Z`, `${end}T23:59:59Z`] }],
        },
        { op: '<=', args: [{ property: 'eo:cloud_cover' }, 10] },
      ],
    },
    sortby: [{ field: 'datetime', direction: 'desc' }],
  };

  return cached(ndviMosaics, `${start}/${end}`, async () => {
    const response = await fetch(`${PLANETARY}/mosaic/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(search),
    });
    if (!response.ok) {
      throw new Error(`Planetary Computer: HTTP ${response.status}`);
    }

    const { searchid } = await response.json();
    return `${PLANETARY}/mosaic/tiles/${searchid}/WebMercatorQuad/{z}/{x}/{y}@1x?${NDVI_QUERY}`;
  });
}

function makeTileLayer(source, tileUrl) {
  return {
    layerId: source.layerId,
    tileUrl,
    maxNativeZoom: source.maxNativeZoom,
    zoomLimit: source.zoomLimit ?? source.maxNativeZoom,
  };
}

export async function getScene(layerKey, year) {
  const spec = SCENES[layerKey]?.[year];
  if (!spec) {
    throw new Error(`No ${layerKey} imagery for ${year}`);
  }

  const source = SOURCES[spec.source];

  let basemap = null;
  if (BASEMAPS[layerKey]) {
    basemap = await getScene(BASEMAPS[layerKey], year);
  }

  const scene = {
    layerKey,
    year,
    date: spec.date ?? null,
    period: spec.period,
    fillDate: spec.fill?.date ?? null,
    source,
    basemap,
    tiles: [],
  };

  if (source.planetary) {
    const tileUrl = await getNdviTileUrl(spec.period);
    scene.tiles.push(makeTileLayer(source, tileUrl));
    return scene;
  }

  const days = [spec];
  if (spec.fill) {
    days.unshift(spec.fill);
  }

  for (const day of days) {
    const daySource = SOURCES[day.source];
    scene.tiles.push(makeTileLayer(daySource, gibsTileUrl(daySource, day.date)));
  }
  return scene;
}

export async function getScenePair(layerKey, baselineYear, targetYear) {
  const [baseline, target] = await Promise.all([
    getScene(layerKey, baselineYear),
    getScene(layerKey, targetYear),
  ]);
  return { baseline, target };
}
