import { useEffect, useRef, useState } from "react";
import { History, Satellite, ChevronDown, Check } from "lucide-react";

const LAYER_ORDER = ["truecolor", "lst", "ndvi"];
const DEFAULTS = {
  layerNames: { truecolor: "TRUE RADIANCE", lst: "THERMAL IR", ndvi: "NDVI" },
  // الحساس الحقيقي لصور الخرائط (مركّبات Landsat من سكربت البيانات)
  sensorNames: { 2013: "OLI Landsat 8", 2015: "OLI Landsat 8", 2020: "OLI Landsat 8", 2025: "OLI Landsat 8/9" },
  telemetry: "Epoch telemetry split",
  baselineEpoch: "Baseline epoch",
  targetEpoch: "Target epoch",
  compareHint: "Drag to compare",
};

/**
 * خريطة مدينة بنفس أسلوب شاشة Compare عند الفريق: بطاقتا الفترة (Baseline / Target)
 * والخريطة بخط وسحب، وتحتها اختيار الطبقة. entry = manifest.cities[city] من سكربت البيانات.
 */
export default function MapCard({ city, cityName, entry, epochs = {}, labels = {} }) {
  const T = { ...DEFAULTS, ...labels };
  const layers = LAYER_ORDER.filter((l) => entry.layers?.[l]);
  const [layer, setLayer] = useState(layers[0]);
  const [beforeSel, setBeforeSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(50);
  const [ratio, setRatio] = useState(1);
  const stage = useRef(null);
  const menu = useRef(null);
  const dragging = useRef(false);

  // قفل قائمة الفترات بالضغط خارجها أو Esc
  useEffect(() => {
    if (!open) return;
    const close = (e) => !menu.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const files = entry.layers?.[layer] || {};
  const years = Object.keys(files).sort();
  const after = years[years.length - 1];
  const befores = years.slice(0, -1);
  const before = befores.includes(beforeSel) ? beforeSel : befores[0];
  if (!before || !after) return null;

  const url = (y) => `/maps/${files[y]}`;
  const tag = (y) => (epochs[y] ? `${y} · ${epochs[y]}` : y);
  const clamp = (v) => Math.min(100, Math.max(0, v));

  function moveTo(e) {
    const r = stage.current.getBoundingClientRect();
    setPos(clamp(((e.clientX - r.left) / r.width) * 100));
  }
  function onKey(e) {
    if (e.key === "ArrowLeft") setPos((p) => clamp(p - 5));
    if (e.key === "ArrowRight") setPos((p) => clamp(p + 5));
  }

  return (
    <figure className="pa-map">
      <div className="pa-map-head">
        <span className="pa-map-kicker">{T.telemetry}</span>
        <h3>{cityName || city}</h3>
      </div>

      <div className="pa-epochs">
        <div className="pa-epoch" ref={menu}>
          <button type="button" className="pa-epoch-card" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="pa-epoch-label">
              <em>{T.baselineEpoch}</em>
              <span className="pa-epoch-icons"><History size={13} /><ChevronDown size={12} /></span>
            </span>
            <span className="pa-epoch-value"><b>{before}</b><small>{T.sensorNames[before]}</small></span>
          </button>
          {open && (
            <ul className="pa-epoch-menu" role="listbox">
              {befores.map((y) => (
                <li key={y}>
                  <button type="button" role="option" aria-selected={y === before}
                          onClick={() => { setBeforeSel(y); setOpen(false); }}>
                    <span>{y}{epochs[y] ? ` — ${epochs[y]}` : ""}</span>
                    {y === before && <Check size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <span className="pa-epoch-swap" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 17h9M8 14l3 3-3 3" /><path d="M22 8h-9M16 5l-3 3 3 3" />
          </svg>
        </span>

        <div className="pa-epoch target">
          <div className="pa-epoch-card">
            <span className="pa-epoch-label">
              <em>{T.targetEpoch}</em>
              <span className="pa-epoch-icons"><Satellite size={14} /></span>
            </span>
            <span className="pa-epoch-value"><b>{after}</b><small>{T.sensorNames[after]}</small></span>
          </div>
        </div>
      </div>

      <div
        ref={stage}
        className="pa-map-stage"
        style={{ aspectRatio: ratio }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e);
        }}
        onPointerMove={(e) => dragging.current && moveTo(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <img src={url(after)} alt={`${cityName || city} ${after}`} draggable="false"
             onLoad={(e) => e.target.naturalHeight && setRatio(e.target.naturalWidth / e.target.naturalHeight)} />
        <img className="pa-map-before" src={url(before)} alt={`${cityName || city} ${before}`} draggable="false"
             style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <span className="pa-map-line" style={{ left: `${pos}%` }} />
        <span className="pa-map-handle" role="slider" tabIndex={0} aria-label={T.compareHint}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
              style={{ left: `${pos}%` }} onKeyDown={onKey}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-5 5 5 5" />
            <path d="M15 7l5 5-5 5" />
          </svg>
        </span>
        <span className="pa-map-tag l">{tag(before)}</span>
        <span className="pa-map-tag r">{tag(after)}</span>
      </div>

      <div className="pa-seg" role="group">
        {layers.map((l) => (
          <button key={l} type="button" className={l === layer ? "on" : ""} onClick={() => setLayer(l)}>
            {T.layerNames[l] || l}
          </button>
        ))}
      </div>
    </figure>
  );
}
