import { getArea } from '../data';

const API = 'https://modis.ornl.gov/rst/api/v1';
const CENTER = { latitude: 24.715, longitude: 46.73 };

const PRODUCTS = {
  lstDay: { product: 'MYD11A2', band: 'LST_Day_1km', windowKm: 50 },
  lstNight: { product: 'MYD11A2', band: 'LST_Night_1km', windowKm: 50 },
  qcDay: { product: 'MYD11A2', band: 'QC_Day', windowKm: 50 },
  qcNight: { product: 'MYD11A2', band: 'QC_Night', windowKm: 50 },
  viewTime: { product: 'MYD11A2', band: 'Day_view_time', windowKm: 50 },
  ndvi: { product: 'MOD13Q1', band: '250m_16_days_NDVI', windowKm: 25 },
  reliability: { product: 'MOD13Q1', band: '250m_16_days_pixel_reliability', windowKm: 25 },
  landCover: { product: 'MCD12Q1', band: 'LC_Type1', windowKm: 50 },
  landCoverQc: { product: 'MCD12Q1', band: 'QC', windowKm: 50 },
  landWater: { product: 'MCD12Q1', band: 'LW', windowKm: 50 },
};

const LST_SCALE = 0.02;
const KELVIN = 273.15;
const LST_MIN = 7500;
const VIEW_TIME_SCALE = 0.1;
const VIEW_TIME_MAX = 240;
const NDVI_SCALE = 0.0001;
const NDVI_MIN = -2000;
const NDVI_MAX = 10000;

const LAND_COVER_LAST_YEAR = 2024;
const URBAN = 13;
const WATER = 17;
const LAND_COVER_FILL = 255;
const LAND_COVER_BAD_QC = [1, 2, 3, 5, 10];
const LW_WATER = 1;

const SEASONS = { lst: [182, 236], ndvi: [32, 106] };

const RURAL_MIN_DISTANCE = 3;
const MIN_URBAN_PIXELS = 5;
const MIN_RURAL_PIXELS = 100;

const GREEN_NDVI = 0.15;
const BARE_NDVI = 0.1;

const EARTH_RADIUS = 6371007.181;
const DEG = Math.PI / 180;

function modisDate(year, day) {
  return `A${year}${String(day).padStart(3, '0')}`;
}

const cache = new Map();

function cached(key, load) {
  if (!cache.has(key)) {
    const request = load();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key);
}

function fetchBand(key, startDate, endDate) {
  const { product, band, windowKm } = PRODUCTS[key];
  const query = new URLSearchParams({
    latitude: CENTER.latitude,
    longitude: CENTER.longitude,
    band,
    startDate,
    endDate,
    kmAboveBelow: windowKm,
    kmLeftRight: windowKm,
  });
  const url = `${API}/${product}/subset?${query}`;

  return cached(url, async () => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`ORNL DAAC ${product}: HTTP ${response.status}`);
    const json = await response.json();
    if (!json.subset?.length) throw new Error(`ORNL DAAC ${product}: no data for ${startDate}`);
    return {
      grid: {
        xll: Number(json.xllcorner),
        yll: Number(json.yllcorner),
        cellSize: Number(json.cellsize),
        rows: Number(json.nrows),
        cols: Number(json.ncols),
      },
      composites: json.subset.map((item) => item.data),
    };
  });
}

function toLatLng(x, y) {
  const lat = y / EARTH_RADIUS / DEG;
  return { lat, lng: x / (EARTH_RADIUS * Math.cos(lat * DEG)) / DEG };
}

function cellCenter(grid, row, col) {
  const x = grid.xll + (col + 0.5) * grid.cellSize;
  const y = grid.yll + (grid.rows - row - 0.5) * grid.cellSize;
  return { x, y };
}

function cellIndexAt(grid, x, y) {
  const col = Math.floor((x - grid.xll) / grid.cellSize);
  const row = grid.rows - 1 - Math.floor((y - grid.yll) / grid.cellSize);
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return -1;
  return row * grid.cols + col;
}

function cellsInBox(grid, [lat, lng], halfKm) {
  const latSpan = (halfKm * 1000) / EARTH_RADIUS / DEG;
  const lngSpan = (halfKm * 1000) / (EARTH_RADIUS * Math.cos(lat * DEG)) / DEG;
  const cells = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const { x, y } = cellCenter(grid, row, col);
      const point = toLatLng(x, y);
      if (Math.abs(point.lat - lat) <= latSpan && Math.abs(point.lng - lng) <= lngSpan) {
        cells.push(row * grid.cols + col);
      }
    }
  }
  return cells;
}

function mean(values) {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (!Number.isNaN(value)) {
      sum += value;
      count += 1;
    }
  }
  if (count === 0) {
    return null;
  }
  return sum / count;
}

function isGoodLst(value, qc) {
  if (value < LST_MIN) return false;
  const mandatory = qc & 3;
  const error = (qc >> 6) & 3;
  return mandatory <= 1 && error <= 1;
}

function toCelsius(raw) {
  return raw * LST_SCALE - KELVIN;
}

function seasonalLst(values, qc) {
  const size = values.composites[0].length;
  const means = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    let sum = 0;
    let count = 0;
    for (let c = 0; c < values.composites.length; c += 1) {
      const raw = values.composites[c][i];
      if (isGoodLst(raw, qc.composites[c][i])) {
        sum += toCelsius(raw);
        count += 1;
      }
    }
    means[i] = count > 0 ? sum / count : NaN;
  }
  return means;
}

function seasonalDiurnalRange(day, qcDay, night, qcNight) {
  const size = day.composites[0].length;
  const means = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    let sum = 0;
    let count = 0;
    for (let c = 0; c < day.composites.length; c += 1) {
      const dayRaw = day.composites[c][i];
      const nightRaw = night.composites[c][i];
      if (isGoodLst(dayRaw, qcDay.composites[c][i]) && isGoodLst(nightRaw, qcNight.composites[c][i])) {
        sum += toCelsius(dayRaw) - toCelsius(nightRaw);
        count += 1;
      }
    }
    means[i] = count > 0 ? sum / count : NaN;
  }
  return means;
}

function seasonalViewTime(viewTime, day, qcDay) {
  const size = viewTime.composites[0].length;
  const means = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    let sum = 0;
    let count = 0;
    for (let c = 0; c < viewTime.composites.length; c += 1) {
      const raw = viewTime.composites[c][i];
      if (raw <= VIEW_TIME_MAX && isGoodLst(day.composites[c][i], qcDay.composites[c][i])) {
        sum += raw * VIEW_TIME_SCALE;
        count += 1;
      }
    }
    means[i] = count > 0 ? sum / count : NaN;
  }
  return means;
}

function seasonalNdvi(ndvi, reliability) {
  const size = ndvi.composites[0].length;
  const means = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    let sum = 0;
    let count = 0;
    for (let c = 0; c < ndvi.composites.length; c += 1) {
      const raw = ndvi.composites[c][i];
      const rank = reliability.composites[c][i];
      if (raw >= NDVI_MIN && raw <= NDVI_MAX && (rank === 0 || rank === 1)) {
        sum += raw * NDVI_SCALE;
        count += 1;
      }
    }
    means[i] = count > 0 ? sum / count : NaN;
  }
  return means;
}

function describeLstPixels(lstGrid, landCover, landCoverQc, landWater) {
  const size = lstGrid.rows * lstGrid.cols;
  const urbanShare = new Float64Array(size);
  const usable = new Array(size).fill(true);
  const quarter = lstGrid.cellSize / 4;

  for (let i = 0; i < size; i += 1) {
    const { x, y } = cellCenter(lstGrid, Math.floor(i / lstGrid.cols), i % lstGrid.cols);
    let urban = 0;
    let land = 0;

    for (const dx of [-quarter, quarter]) {
      for (const dy of [-quarter, quarter]) {
        const index = cellIndexAt(landCover.grid, x + dx, y + dy);
        if (index < 0) {
          usable[i] = false;
          continue;
        }
        const landClass = landCover.composites[0][index];
        const qc = landCoverQc.composites[0][index];
        const isWater = landClass === WATER || landWater.composites[0][index] === LW_WATER;
        if (landClass === LAND_COVER_FILL || LAND_COVER_BAD_QC.includes(qc) || isWater) {
          usable[i] = false;
          continue;
        }
        land += 1;
        if (landClass === URBAN) urban += 1;
      }
    }

    urbanShare[i] = land > 0 ? urban / land : NaN;
  }

  return { urbanShare, usable };
}

function distanceFromUrban(grid, urbanShare) {
  const size = grid.rows * grid.cols;
  const distance = new Array(size).fill(Infinity);
  const queue = [];

  for (let i = 0; i < size; i += 1) {
    if (urbanShare[i] > 0) {
      distance[i] = 0;
      queue.push(i);
    }
  }

  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    const row = Math.floor(i / grid.cols);
    const col = i % grid.cols;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) continue;
        const next = r * grid.cols + c;
        if (distance[next] > distance[i] + 1) {
          distance[next] = distance[i] + 1;
          queue.push(next);
        }
      }
    }
  }

  return distance;
}

function loadYear(year) {
  return cached(`year-${year}`, async () => {
    const [lstFrom, lstTo] = SEASONS.lst.map((day) => modisDate(year, day));
    const [ndviFrom, ndviTo] = SEASONS.ndvi.map((day) => modisDate(year, day));
    const landCoverYear = Math.min(year, LAND_COVER_LAST_YEAR);
    const landCoverDate = modisDate(landCoverYear, 1);

    const [lstDay, lstNight, qcDay, qcNight, viewTime, ndvi, reliability, landCover, landCoverQc, landWater] =
      await Promise.all([
        fetchBand('lstDay', lstFrom, lstTo),
        fetchBand('lstNight', lstFrom, lstTo),
        fetchBand('qcDay', lstFrom, lstTo),
        fetchBand('qcNight', lstFrom, lstTo),
        fetchBand('viewTime', lstFrom, lstTo),
        fetchBand('ndvi', ndviFrom, ndviTo),
        fetchBand('reliability', ndviFrom, ndviTo),
        fetchBand('landCover', landCoverDate, landCoverDate),
        fetchBand('landCoverQc', landCoverDate, landCoverDate),
        fetchBand('landWater', landCoverDate, landCoverDate),
      ]);

    const lstGrid = lstDay.grid;
    const { urbanShare, usable } = describeLstPixels(lstGrid, landCover, landCoverQc, landWater);
    const distance = distanceFromUrban(lstGrid, urbanShare);

    const ruralCells = [];
    for (let i = 0; i < urbanShare.length; i += 1) {
      if (usable[i] && urbanShare[i] === 0 && distance[i] >= RURAL_MIN_DISTANCE) {
        ruralCells.push(i);
      }
    }

    return {
      lstGrid,
      lstDay: seasonalLst(lstDay, qcDay),
      lstNight: seasonalLst(lstNight, qcNight),
      diurnalRange: seasonalDiurnalRange(lstDay, qcDay, lstNight, qcNight),
      viewTime: seasonalViewTime(viewTime, lstDay, qcDay),
      urbanShare,
      usable,
      ruralCells,
      ndviGrid: ndvi.grid,
      ndvi: seasonalNdvi(ndvi, reliability),
      landCoverGrid: landCover.grid,
      landCover: landCover.composites[0],
      landCoverYear,
    };
  });
}

function urbanMinusRural(temperatures, urbanCells, ruralCells) {
  if (urbanCells.length < MIN_URBAN_PIXELS || ruralCells.length < MIN_RURAL_PIXELS) {
    return null;
  }
  const urban = mean(urbanCells.map((i) => temperatures[i]));
  const rural = mean(ruralCells.map((i) => temperatures[i]));
  if (urban === null || rural === null) {
    return null;
  }
  return urban - rural;
}

function computeValues(data, area) {
  const { center } = area.view;
  const { halfKm } = area.analysis;

  const lstCells = cellsInBox(data.lstGrid, center, halfKm);
  const lstDay = mean(lstCells.map((i) => data.lstDay[i]));
  const overpassHour = mean(lstCells.map((i) => data.viewTime[i]));
  const diurnalRange = mean(lstCells.map((i) => data.diurnalRange[i]));

  const urbanCells = lstCells.filter((i) => data.usable[i] && data.urbanShare[i] === 1);
  const heatIsland = urbanMinusRural(data.lstDay, urbanCells, data.ruralCells);
  const heatIslandNight = urbanMinusRural(data.lstNight, urbanCells, data.ruralCells);

  const ndviCells = cellsInBox(data.ndviGrid, center, halfKm).filter((i) => !Number.isNaN(data.ndvi[i]));
  const cellKm2 = (data.ndviGrid.cellSize / 1000) ** 2;
  const ndvi = mean(ndviCells.map((i) => data.ndvi[i]));
  const greenCoverKm2 = ndviCells.filter((i) => data.ndvi[i] >= GREEN_NDVI).length * cellKm2;
  const bareLandKm2 = ndviCells.filter((i) => data.ndvi[i] < BARE_NDVI).length * cellKm2;

  const lcCells = cellsInBox(data.landCoverGrid, center, halfKm).filter((i) => {
    return data.landCover[i] !== LAND_COVER_FILL;
  });
  let urbanPercent = null;
  if (lcCells.length > 0) {
    const urbanLcCells = lcCells.filter((i) => data.landCover[i] === URBAN);
    urbanPercent = (urbanLcCells.length / lcCells.length) * 100;
  }

  return {
    lstDay,
    overpassHour,
    diurnalRange,
    heatIsland,
    heatIslandNight,
    urbanSamples: urbanCells.length,
    ruralSamples: data.ruralCells.length,
    ndvi,
    greenCoverKm2,
    bareLandKm2,
    urbanPercent,
  };
}

async function getYear(areaId, year) {
  const data = await loadYear(year);
  return { year, values: computeValues(data, getArea(areaId)), landCoverYear: data.landCoverYear };
}

export async function fetchComparison(areaId, baselineYear, targetYear) {
  const [baseline, target] = await Promise.all([
    getYear(areaId, baselineYear),
    getYear(areaId, targetYear),
  ]);
  return { baseline, target };
}

export async function fetchTrajectory(areaId, years) {
  const results = [];
  for (const year of years) {
    results.push(getYear(areaId, year));
  }
  return Promise.all(results);
}
