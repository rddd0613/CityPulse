import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Icon } from '../icons';
import { useSettings } from '../settings';
import { REFERENCE_OVERLAY } from '../services/imagery';
import { formatCoordinates } from '../utils';

const PANES = {
  after: { name: 'afterImagery', zIndex: 200 },
  before: { name: 'beforeImagery', zIndex: 210 },
  reference: { name: 'referenceOverlay', zIndex: 300 },
  areaBox: { name: 'areaBox', zIndex: 400 },
  areaLabels: { name: 'areaLabels', zIndex: 410 },
};

const NO_LAYERS = [];
const DOUBLE_TAP_ZOOM = 2;
const FADE_MS = 400;
const MAX_WAIT_MS = 8000;
const IS_HIGH_DENSITY = window.devicePixelRatio > 1;
const ZOOM_STEP = 0.5;
const ZOOM_PAST_NATIVE = 0.5;

function getZoomLimit(scenes, areaMaxZoom) {
  const shown = scenes.filter(Boolean);
  if (shown.length === 0) {
    return areaMaxZoom;
  }

  const limits = shown.map((scene) => {
    const tileLimits = scene.tiles.map((tile) => tile.zoomLimit);
    return Math.max(...tileLimits);
  });

  const isTrueColor = shown.every((scene) => scene.layerKey === 'trueColor');
  let native;
  if (isTrueColor) {
    native = Math.max(...limits);
  } else {
    native = Math.min(...limits);
  }

  return Math.min(areaMaxZoom, native + ZOOM_PAST_NATIVE);
}

export function getLayerList(scene, overlayOpacity) {
  if (!scene) {
    return [];
  }

  const list = [];
  let ownOpacity = 1;

  if (scene.basemap) {
    for (const tile of scene.basemap.tiles) {
      list.push({ ...tile, opacity: 1 });
    }
    ownOpacity = overlayOpacity;
  }

  for (const tile of scene.tiles) {
    list.push({ ...tile, opacity: ownOpacity });
  }

  return list;
}

export function createTileLayer(map, item, pane) {
  const options = {
    pane,
    maxNativeZoom: item.maxNativeZoom,
    maxZoom: 22,
    keepBuffer: 6,
    updateWhenIdle: false,
    updateWhenZooming: false,
    opacity: 0,
  };

  if (IS_HIGH_DENSITY) {
    options.tileSize = 128;
    options.zoomOffset = 1;
    options.maxNativeZoom = item.maxNativeZoom - 1;
  }

  return L.tileLayer(item.tileUrl, options).addTo(map);
}

function whenLoaded(layer, callback) {
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    callback();
  }

  layer.once('load', finish);
  setTimeout(finish, MAX_WAIT_MS);
}

export function switchLayers(map, oldLayers, list, pane) {
  const remaining = [...oldLayers];
  const newLayers = [];
  const fadingIn = [];

  list.forEach((item, index) => {
    const existing = remaining.find((layer) => layer.tileUrl === item.tileUrl);

    if (existing) {
      remaining.splice(remaining.indexOf(existing), 1);
      existing.opacity = item.opacity;
      existing.zIndex = index + 1;

      if (existing.isReady) {
        existing.leafletLayer.setOpacity(existing.opacity);
        existing.leafletLayer.setZIndex(existing.zIndex);
      }
      newLayers.push(existing);
      return;
    }

    const layer = {
      tileUrl: item.tileUrl,
      opacity: item.opacity,
      zIndex: index + 1,
      isReady: false,
      leafletLayer: createTileLayer(map, item, pane),
    };
    newLayers.push(layer);

    if (oldLayers.length === 0) {
      layer.isReady = true;
      layer.leafletLayer.setZIndex(layer.zIndex);
      layer.leafletLayer.setOpacity(layer.opacity);
      return;
    }

    layer.leafletLayer.setZIndex(100 + layer.zIndex);
    fadingIn.push(layer);
  });

  if (fadingIn.length === 0) {
    for (const old of remaining) {
      old.leafletLayer.setOpacity(0);
      setTimeout(() => old.leafletLayer.remove(), FADE_MS);
    }
    return newLayers;
  }

  let waiting = fadingIn.length;
  for (const layer of fadingIn) {
    whenLoaded(layer.leafletLayer, () => {
      layer.leafletLayer.setOpacity(layer.opacity);
      waiting -= 1;
      if (waiting > 0) return;

      setTimeout(() => {
        for (const old of remaining) {
          old.leafletLayer.remove();
        }
        for (const item of fadingIn) {
          item.isReady = true;
          item.leafletLayer.setZIndex(item.zIndex);
          item.leafletLayer.setOpacity(item.opacity);
        }
      }, FADE_MS);
    });
  }

  return newLayers;
}

function escapeHtml(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

function makeLabelIcon(label) {
  const classes = ['area-label'];
  if (label.selected) classes.push('area-label--selected');
  if (label.city) classes.push('area-label--city');
  if (label.deferToReference) classes.push('area-label--defer');

  return L.divIcon({
    className: classes.join(' '),
    html: `<span>${escapeHtml(label.name)}</span>`,
    iconSize: null,
  });
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function hideCrowdedLabels(container) {
  const labels = [...container.querySelectorAll('.area-label')];
  const rank = (label) => {
    if (label.classList.contains('area-label--selected')) return 0;
    if (label.classList.contains('area-label--city')) return 1;
    return 2;
  };
  labels.sort((a, b) => rank(a) - rank(b));

  const shown = [];
  for (const label of labels) {
    label.classList.remove('area-label--crowded');
    const box = label.firstElementChild.getBoundingClientRect();
    if (box.width === 0) continue;

    if (shown.some((other) => overlaps(box, other))) {
      label.classList.add('area-label--crowded');
    } else {
      shown.push(box);
    }
  }
}

function SplitTileMap(props) {
  const { view, beforeScene, afterScene, splitPosition, overlayOpacity } = props;
  const { referenceLayers, areaOverlay, onMapReady, onViewChange } = props;

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ before: [], after: [], reference: [], area: [] });
  const zoomBeforeLimitRef = useRef(null);
  const splitRef = useRef(splitPosition);
  const callbacksRef = useRef({ onMapReady, onViewChange });

  splitRef.current = splitPosition;
  callbacksRef.current = { onMapReady, onViewChange };

  function clipBeforePane() {
    const map = mapRef.current;
    if (!map) return;

    const pane = map.getPane(PANES.before.name);
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    const bottomRight = map.containerPointToLayerPoint(size);
    const splitX = topLeft.x + (size.x * splitRef.current) / 100;

    pane.style.clip = `rect(${topLeft.y}px, ${splitX}px, ${bottomRight.y}px, ${topLeft.x}px)`;
  }

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: view.center,
      zoom: view.zoom,
      minZoom: view.minZoom,
      maxZoom: view.maxZoom,
      zoomSnap: 0,
      zoomDelta: ZOOM_STEP,
      wheelPxPerZoomLevel: 120,
      inertia: true,
      inertiaDeceleration: 2000,
      easeLinearity: 0.25,
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
    });
    mapRef.current = map;

    for (const pane of Object.values(PANES)) {
      map.createPane(pane.name).style.zIndex = pane.zIndex;
    }

    function reportView() {
      const center = map.getCenter();
      const view = { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
      callbacksRef.current.onViewChange?.(view);
    }

    function zoomOnto(event) {
      const maxZoom = map.getMaxZoom();
      const glide = { duration: 0.6 };

      if (map.getZoom() >= maxZoom) {
        map.flyTo(view.center, Math.min(view.zoom, maxZoom), glide);
      } else {
        const zoom = Math.min(map.getZoom() + DOUBLE_TAP_ZOOM, maxZoom);
        map.flyTo(event.latlng, zoom, glide);
      }
    }

    function markZoom() {
      containerRef.current.dataset.zoomedOut = String(map.getZoom() < 11);
      hideCrowdedLabels(containerRef.current);
    }

    map.on('dblclick', zoomOnto);
    map.on('zoomend', markZoom);
    map.on('move zoom resize', clipBeforePane);
    map.on('moveend', reportView);

    markZoom();
    clipBeforePane();
    reportView();

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    callbacksRef.current.onMapReady?.(map);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = { before: [], after: [], reference: [], area: [] };
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const limit = getZoomLimit([beforeScene, afterScene], view.maxZoom);
    if (map.getZoom() > limit) {
      zoomBeforeLimitRef.current = map.getZoom();
    }
    map.setMaxZoom(limit);

    const rememberedZoom = zoomBeforeLimitRef.current;
    if (rememberedZoom && limit > map.getZoom()) {
      map.setZoom(Math.min(rememberedZoom, limit));
      if (limit >= rememberedZoom) {
        zoomBeforeLimitRef.current = null;
      }
    }

    const layers = layersRef.current;
    const beforeList = getLayerList(beforeScene, overlayOpacity);
    const afterList = getLayerList(afterScene, overlayOpacity);
    layers.before = switchLayers(map, layers.before, beforeList, PANES.before.name);
    layers.after = switchLayers(map, layers.after, afterList, PANES.after.name);
  }, [beforeScene, afterScene, overlayOpacity, view.maxZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const layer of layersRef.current.reference) {
      layer.remove();
    }

    layersRef.current.reference = referenceLayers.map((reference) => {
      const layer = L.tileLayer(reference.tileUrl, {
        pane: PANES.reference.name,
        maxNativeZoom: reference.maxNativeZoom,
        maxZoom: reference.maxNativeZoom + 1,
      });
      return layer.addTo(map);
    });
  }, [referenceLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const layer of layersRef.current.area) {
      layer.remove();
    }
    layersRef.current.area = [];
    if (!areaOverlay) return;

    const box = L.rectangle(areaOverlay.box, {
      pane: PANES.areaBox.name,
      className: 'area-box',
      interactive: false,
    });
    layersRef.current.area.push(box.addTo(map));

    for (const label of areaOverlay.labels) {
      const marker = L.marker(label.center, {
        pane: PANES.areaLabels.name,
        icon: makeLabelIcon(label),
        interactive: false,
        keyboard: false,
      });
      layersRef.current.area.push(marker.addTo(map));
    }
    hideCrowdedLabels(containerRef.current);
  }, [areaOverlay]);

  useEffect(() => {
    clipBeforePane();
  }, [splitPosition]);

  return <div ref={containerRef} className="split-tile-map" />;
}

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

function useDivider(containerRef, setPosition) {
  const isDragging = useRef(false);

  function moveTo(event) {
    const box = containerRef.current.getBoundingClientRect();
    const percent = ((event.clientX - box.left) / box.width) * 100;
    setPosition(clamp(percent));
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    isDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event);
  }

  function onPointerMove(event) {
    if (isDragging.current) {
      moveTo(event);
    }
  }

  function onPointerUp(event) {
    isDragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      setPosition((current) => clamp(current - 2));
    } else if (event.key === 'ArrowRight') {
      setPosition((current) => clamp(current + 2));
    } else {
      return;
    }
    event.preventDefault();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown };
}

export default function CompareMap(props) {
  const { view, beforeScene, afterScene, areaOverlay } = props;
  const { beforeLabel, afterLabel, sourceLabel, notice } = props;

  const figureRef = useRef(null);
  const mapRef = useRef(null);
  const { settings, strings, direction } = useSettings();
  const [position, setPosition] = useState(20);
  const [center, setCenter] = useState(null);
  const dividerEvents = useDivider(figureRef, setPosition);

  let referenceLayers = NO_LAYERS;
  if (settings.showOverlayLabels) {
    referenceLayers = REFERENCE_OVERLAY;
  }

  function recenter() {
    mapRef.current?.flyTo(view.center, view.zoom, { duration: 0.6 });
  }

  return (
    <figure ref={figureRef} className="compare-map" dir="ltr">
      <SplitTileMap
        view={view}
        beforeScene={beforeScene}
        afterScene={afterScene}
        splitPosition={position}
        overlayOpacity={settings.heatMapOpacity / 100}
        referenceLayers={referenceLayers}
        areaOverlay={areaOverlay}
        onMapReady={(map) => {
          mapRef.current = map;
        }}
        onViewChange={setCenter}
      />

      {notice && (
        <div className="compare-map__notice" role="status">
          {notice}
        </div>
      )}

      {!notice && (
        <div className="compare-map__divider" style={{ left: `${position}%` }} {...dividerEvents}>
          <span
            className="compare-map__handle"
            role="slider"
            tabIndex={0}
            aria-label={strings.dividerLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
          >
            <Icon name="split" size={16} />
          </span>
        </div>
      )}

      <span className="compare-map__tag compare-map__tag--before" dir={direction}>
        <span className="compare-map__bar" />
        {beforeLabel}
      </span>
      <span className="compare-map__tag compare-map__tag--after" dir={direction}>
        <span className="status-dot" />
        {afterLabel}
      </span>

      <figcaption className="compare-map__footer">
        <span className="compare-map__footer-row">
          <button type="button" className="compare-map__recenter" onClick={recenter}>
            <Icon name="focus" size={16} />
            {strings.nadirLock}
          </button>

          {settings.showOverlayLabels && center && (
            <span className="compare-map__coords" dir="ltr">
              {formatCoordinates(center, strings)}
            </span>
          )}

          <span className="compare-map__source" dir={direction}>
            {sourceLabel}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
