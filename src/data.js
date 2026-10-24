export const NAV_ITEMS = [
  { id: 'explore', icon: 'globe', ready: true },
  { id: 'compare', icon: 'compare', ready: true },
  { id: 'pulse-ai', featured: true },
  { id: 'insights', icon: 'insights', ready: true },
  { id: 'data', icon: 'database', ready: true },
];

export const DEFAULT_ROUTE = 'explore';

export const EPOCHS = [2013, 2015, 2020, 2025];
export const DEFAULT_BASELINE_YEAR = 2013;
export const DEFAULT_TARGET_YEAR = 2025;

export function getBaselineOptions() {
  const lastYear = EPOCHS[EPOCHS.length - 1];
  return EPOCHS.map((year) => ({ year, disabled: year === lastYear }));
}

export function getTargetOptions(baselineYear) {
  const laterYears = EPOCHS.filter((year) => year > baselineYear);
  return laterYears.map((year) => ({ year, disabled: false }));
}

export function resolveTargetYear(baselineYear, targetYear) {
  if (targetYear > baselineYear) {
    return targetYear;
  }
  const nextYear = EPOCHS.find((year) => year > baselineYear);
  return nextYear ?? targetYear;
}

const MAP_LIMITS = { minZoom: 6, maxZoom: 12.5 };

function district(center) {
  return { center, zoom: 11, ...MAP_LIMITS };
}

const DISTRICT_BOX = { halfKm: 2 };

export const AREAS = [
  {
    id: 'riyadh',
    names: { en: 'Riyadh', ar: 'الرياض' },
    kind: 'city',
    view: { center: [24.715, 46.73], zoom: 10, ...MAP_LIMITS },
    analysis: { halfKm: 20 },
  },
  {
    id: 'al-malqa',
    names: { en: 'Al Malqa & North Corridor', ar: 'الملقا والممر الشمالي' },
    kind: 'district',
    view: district([24.799, 46.5976]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-nafal',
    names: { en: 'Al Nafal', ar: 'النفل' },
    kind: 'district',
    view: district([24.7801, 46.6737]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-olaya',
    names: { en: 'Al Olaya', ar: 'العليا' },
    kind: 'district',
    view: district([24.6957, 46.6811]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-rabwah',
    names: { en: 'Al Rabwah', ar: 'الربوة' },
    kind: 'district',
    view: district([24.6928, 46.7542]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-malaz',
    names: { en: 'Al Malaz', ar: 'الملز' },
    kind: 'district',
    view: district([24.6647, 46.7353]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-yasmin',
    names: { en: 'Al Yasmin', ar: 'الياسمين' },
    kind: 'district',
    view: district([24.8169, 46.6361]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-narjis',
    names: { en: 'Al Narjis', ar: 'النرجس' },
    kind: 'district',
    view: district([24.8341, 46.6802]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-sahafa',
    names: { en: 'Al Sahafa', ar: 'الصحافة' },
    kind: 'district',
    view: district([24.7969, 46.6401]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'qurtubah',
    names: { en: 'Qurtubah', ar: 'قرطبة' },
    kind: 'district',
    view: district([24.8132, 46.7329]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'ishbiliyah',
    names: { en: 'Ishbiliyah', ar: 'إشبيلية' },
    kind: 'district',
    view: district([24.7948, 46.7947]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'hittin',
    names: { en: 'Hittin', ar: 'حطين' },
    kind: 'district',
    view: district([24.7611, 46.6021]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-aqiq',
    names: { en: 'Al Aqiq', ar: 'العقيق' },
    kind: 'district',
    view: district([24.774, 46.6309]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-ghadir',
    names: { en: 'Al Ghadir', ar: 'الغدير' },
    kind: 'district',
    view: district([24.7742, 46.6556]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'kafd',
    names: { en: 'King Abdullah Financial District', ar: 'مركز الملك عبدالله المالي' },
    kind: 'district',
    view: district([24.7628, 46.6403]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-hamra',
    names: { en: 'Al Hamra', ar: 'الحمراء' },
    kind: 'district',
    view: district([24.777, 46.7527]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-muruj',
    names: { en: 'Al Muruj', ar: 'المروج' },
    kind: 'district',
    view: district([24.7578, 46.6637]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-mursalat',
    names: { en: 'Al Mursalat', ar: 'المرسلات' },
    kind: 'district',
    view: district([24.7492, 46.6903]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-nakheel',
    names: { en: 'Al Nakheel', ar: 'النخيل' },
    kind: 'district',
    view: district([24.7422, 46.6375]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-rawdah',
    names: { en: 'Al Rawdah', ar: 'الروضة' },
    kind: 'district',
    view: district([24.7347, 46.7678]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-wurud',
    names: { en: 'Al Wurud', ar: 'الورود' },
    kind: 'district',
    view: district([24.7244, 46.6785]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-naseem',
    names: { en: 'Al Naseem', ar: 'النسيم' },
    kind: 'district',
    view: district([24.7189, 46.8256]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-sulimaniyah',
    names: { en: 'Al Sulimaniyah', ar: 'السليمانية' },
    kind: 'district',
    view: district([24.7088, 46.6945]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-murabba',
    names: { en: 'Al Murabba', ar: 'المربع' },
    kind: 'district',
    view: district([24.6461, 46.71]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-aziziyah',
    names: { en: 'Al Aziziyah', ar: 'العزيزية' },
    kind: 'district',
    view: district([24.5856, 46.7731]),
    analysis: DISTRICT_BOX,
  },
  {
    id: 'al-shifa',
    names: { en: 'Al Shifa', ar: 'الشفا' },
    kind: 'district',
    view: district([24.5631, 46.6967]),
    analysis: DISTRICT_BOX,
  },
];

export const DEFAULT_AREA_ID = 'al-malqa';

export function getArea(areaId) {
  const area = AREAS.find((item) => item.id === areaId);
  if (area) {
    return area;
  }
  return AREAS.find((item) => item.id === DEFAULT_AREA_ID);
}

export function getAnalysisBounds(area) {
  const [lat, lng] = area.view.center;
  const kmPerDegreeLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  const dLat = area.analysis.halfKm / 111.32;
  const dLng = area.analysis.halfKm / kmPerDegreeLng;
  return [
    [lat - dLat, lng - dLng],
    [lat + dLat, lng + dLng],
  ];
}

function evenStops(colors, min, max) {
  const step = (max - min) / (colors.length - 1);
  return colors.map((color, index) => ({ value: min + step * index, color }));
}

export const PALETTES = {

  landSurfaceTemperature: evenStops(
    [
      '#c900ff', '#4900ff', '#0047ff',
      '#00ebff', '#66ff12', '#deff00',
      '#ffbe00', '#ff5b00', '#ff0100',
    ],
    200 - 273.15,
    350 - 273.15,
  ),
  ndvi: evenStops(
    [
      '#f1ecec', '#dfcec1', '#b4a596',
      '#a18064', '#96ba20', '#529800',
      '#2e8001', '#006401', '#001801',
    ],
    0,
    1,
  ),
};

export const MAP_LAYERS = [
  { id: 'true-radiance', icon: null, imagery: 'trueColor', scale: null },
  {
    id: 'thermal-ir',
    icon: 'thermometer',
    imagery: 'landSurfaceTemperature',
    scale: {
      kind: 'temperature',
      min: 20,
      max: 60,
      ticks: [20, 30, 40, 50, 60],
      endLabels: { min: 'cooler', max: 'hotter' },
    },
  },
  {
    id: 'ndvi',
    icon: 'sprout',
    imagery: 'ndvi',
    scale: {
      kind: 'index',
      min: -0.2,
      max: 0.6,
      ticks: [
        { value: -0.2, label: 'barren' },
        { value: 0, label: 'soil' },
        { value: 0.2, label: 'sparse' },
        { value: 0.6, label: 'denseCanopy' },
      ],
      title: 'ndviDistribution',
      formula: '(NIR − RED) / (NIR + RED)',
    },
  },
];

export const SCENES = {
  trueColor: {
    2013: {
      source: 'hlsL30',
      date: '2013-12-03',
      fill: { source: 'hlsL30', date: '2013-12-12' },
    },
    2015: {
      source: 'hlsL30',
      date: '2015-01-23',
      fill: { source: 'hlsL30', date: '2015-02-17' },
    },
    2020: { source: 'hlsS30', date: '2020-01-11' },
    2025: { source: 'hlsS30', date: '2025-01-14' },
  },
  landSurfaceTemperature: {
    2013: { source: 'modisAquaLst', date: '2013-07-12' },
    2015: { source: 'modisAquaLst', date: '2015-07-12' },
    2020: { source: 'modisAquaLst', date: '2020-07-11' },
    2025: { source: 'modisAquaLst', date: '2025-07-12' },
  },
  ndvi: {
    2013: { source: 'landsatNdvi', period: ['2013-11-01', '2013-12-31'] },
    2015: { source: 'landsatNdvi', period: ['2015-11-01', '2015-12-31'] },
    2020: { source: 'landsatNdvi', period: ['2020-11-01', '2020-12-31'] },
    2025: { source: 'landsatNdvi', period: ['2025-11-01', '2025-12-31'] },
  },
};

export const METRICS_BY_LAYER = {
  'true-radiance': [
    {
      id: 'surfaceHeat',
      valueId: 'lstDay',
      temperature: 'absolute',
      decimals: 1,
      icon: 'trend',
      increaseIsPositive: false,
    },
    {
      id: 'vegetation',
      valueId: 'ndvi',
      decimals: 2,
      icon: 'trend',
      increaseIsPositive: true,
    },
    {
      id: 'urbanization',
      valueId: 'urbanPercent',
      unit: '%',
      decimals: 0,
      icon: 'building',
      iconTone: 'accent',
      change: 'none',
      caption: 'landCoverMap',
    },
  ],

  'thermal-ir': [
    {
      id: 'surfaceTemp',
      valueId: 'lstDay',
      temperature: 'absolute',
      fullUnitInCaption: true,
      decimals: 1,
      icon: 'trend',
      increaseIsPositive: false,
    },
    {
      id: 'diurnalCooling',
      valueId: 'diurnalRange',
      temperature: 'difference',
      decimals: 1,
      icon: 'bolt',
      iconTone: 'negative',
      caption: 'coolingDelta',
      increaseIsPositive: true,
    },
    {
      id: 'heatIsland',
      valueId: 'heatIsland',
      temperature: 'difference',
      signed: true,
      decimals: 1,
      change: 'temperatureDelta',
      neutral: true,
      icon: 'locationCity',
      iconTone: 'accent',
      caption: 'night',
    },
  ],

  ndvi: [
    {
      id: 'ndviIndex',
      valueId: 'ndvi',
      decimals: 2,
      signed: true,
      icon: 'eco',
      iconTone: 'layer',
      caption: 'vsYear',
      increaseIsPositive: true,
    },
    {
      id: 'greenCover',
      valueId: 'greenCoverKm2',
      unit: 'km²',
      decimals: 1,
      icon: 'park',
      iconTone: 'layer',
      caption: 'netSurge',
      increaseIsPositive: true,
    },
    {
      id: 'aridShift',
      valueId: 'bareLandKm2',
      display: 'change',
      icon: 'landscape',
      iconTone: 'accent',
      caption: 'bareGround',
      increaseIsPositive: false,
    },
  ],
};
