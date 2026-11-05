import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, ChevronRight, ArrowUp, Volume2, Square } from "lucide-react";
import { askAI } from "./ai";
import ConnectionStatus from "./ConnectionStatus";
import { speak, stopSpeaking, ttsSupported } from "./speech";
import MapCard from "./MapCard";
import { detectCity, loadManifest } from "./maps";
import "./PulseAI.css";

const DEFAULT_LABELS = {
  title: "How can I help?",
  sub: "Ask about changes in your city.",
  placeholder: "Ask about your city...",
  // أسئلة عامة بدون اسم مدينة: المستخدم يكتب المدينة بنفسه
  suggestions: [
    "How has this area grown since 2013?",
    "What happened to vegetation over time?",
    "Has this area become warmer?",
  ],
  connected: "Connected",
  offline: "Offline",
  cityNames: { Riyadh: "Riyadh", Jeddah: "Jeddah", Dammam: "Dammam" },
  layerNames: { truecolor: "TRUE RADIANCE", lst: "THERMAL IR", ndvi: "NDVI" },
  telemetry: "Epoch telemetry split",
  baselineEpoch: "Baseline epoch",
  targetEpoch: "Target epoch",
  epochNames: { 2013: "Baseline", 2015: "Expansion", 2020: "Green Riyadh", 2025: "Present" },
  compareHint: "Drag to compare",
  listen: "Listen",
  stop: "Stop",
};

// لوقو التطبيق: يجرّب الملفات بالترتيب، ولو ما لقى شيء يعرض شعار بديل
function Logo({ sources }) {
  const [i, setI] = useState(0);
  if (i < sources.length) {
    return <img className="pa-logo" src={sources[i]} alt="City Pulse" onError={() => setI(i + 1)} />;
  }
  return (
    <span className="pa-logo pa-logo-mark" aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" fillOpacity=".25" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(-25 12 12)" />
      </svg>
    </span>
  );
}

// يحوّل **غامق** والنقاط (* أو -) لشكل مقروء بدل ما تظهر الرموز كما هي
function RichText({ text }) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    const bullet = /^\s*[*-]\s+/.test(line);
    const body = line.replace(/^\s*[*-]\s+/, "");
    const parts = body.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part
    );
    return (
      <span key={li}>
        {bullet ? "• " : ""}
        {parts}
        {li < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

/**
 * شاشة PULSE AI. تتمدد على ارتفاع الحاوية اللي توضع فيها.
 * props (كلها اختيارية):
 *   showHeader      true: يعرض هيدر خاص فيها. مع تطبيق الفريق استعملوا false
 *   onOpenSettings  دالة لزر الإعدادات (لما showHeader = true)
 *   settings        { unit: "C" | "F", lang } من إعدادات التطبيق
 *   autoSpeak       true (الافتراضي): يقرأ الرد بصوت عالٍ بعد ما يكتمل. اربطوه بإعداد عندكم
 *   area            اسم المنطقة المختارة حالياً في التطبيق (مثلاً "Al Malqa, Riyadh"). يفهم منه الشات "هذه المنطقة"
 *   labels          نصوص الواجهة (title, sub, placeholder, suggestions, connected, offline, listen, stop,
 *                   cityNames, layerNames, epochNames, compareHint, telemetry, baselineEpoch, targetEpoch)
 *   logoSources     مسارات اللوقو بالترتيب. الافتراضي ["/logo.svg", "/logo.png"]
 */
export default function PulseAI({
  showHeader = true,
  onOpenSettings,
  settings,
  autoSpeak = true,
  area,
  labels,
  logoSources = ["/logo.svg", "/logo.png"],
}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const [manifest, setManifest] = useState(null);
  const endRef = useRef(null);
  const autoRef = useRef(autoSpeak);
  autoRef.current = autoSpeak;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => stopSpeaking(), []); // يوقف الصوت لما تطلع من الشاشة

  // لو القراءة التلقائية انقفلت (من الإعدادات) نوقف أي صوت شغّال
  useEffect(() => {
    if (!autoSpeak) {
      stopSpeaking();
      setSpeakingIdx(null);
    }
  }, [autoSpeak]);

  // قائمة خرائط المدن (من سكربت البيانات). لو غير موجودة ما تظهر الخرائط ويشتغل الشات عادي
  useEffect(() => {
    let alive = true;
    loadManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, []);

  function playMessage(i, text) {
    if (speakingIdx === i) {
      stopSpeaking();
      setSpeakingIdx(null);
    } else if (speak(text, () => setSpeakingIdx(null))) {
      setSpeakingIdx(i);
    }
  }

  async function send(text) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    stopSpeaking();
    setSpeakingIdx(null);

    const history = [...messages, { role: "user", text: q }];
    setMessages([...history, { role: "assistant", text: "", city: detectCity(q) }]);
    const patchLast = (fn) =>
      setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, text: fn(x.text) } : x)));

    try {
      let full = "";
      await askAI(history, {
        onToken: (tok) => {
          full += tok;
          patchLast((s) => s + tok);
        },
        settings: { ...settings, area },
      });
      // يقرأ الرد بعد ما يكتمل (الأخطاء ما تنقرأ)
      if (autoRef.current && full.trim() && speak(full, () => setSpeakingIdx(null))) {
        setSpeakingIdx(history.length);
      }
    } catch (err) {
      patchLast(() => err.message || "Couldn't get a reply. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pa">
      {showHeader && (
        <header className="pa-top">
          <div>
            <div className="pa-brand">CITY PULSE</div>
            <ConnectionStatus label="Orbit · Sentinel-2" connectedText={L.connected} offlineText={L.offline} />
          </div>
          <button className="pa-icon-btn" aria-label="Settings" onClick={onOpenSettings}>
            <SlidersHorizontal size={16} />
          </button>
        </header>
      )}

      <main className="pa-chat">
        {messages.length === 0 ? (
          <section className="pa-welcome">
            <Logo sources={logoSources} />
            <h1>{L.title}</h1>
            <p>{L.sub}</p>
            <ul>
              {L.suggestions.map((s) => (
                <li key={s}>
                  <button className="pa-suggestion" onClick={() => send(s)}>
                    <span>{s}</span>
                    <ChevronRight size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="pa-thread" aria-live="polite">
            {messages.map((m, i) => {
              const entry = m.role === "assistant" && m.text ? manifest?.cities?.[m.city] : null;
              return (
                <div key={i} className={`pa-msg ${m.role}${entry ? " has-map" : ""}`} dir="auto">
                  {m.text ? <span><RichText text={m.text} /></span> : <span className="pa-typing" aria-label="Thinking"><i /><i /><i /></span>}
                  {entry && (
                    <MapCard city={m.city} cityName={L.cityNames[m.city]} entry={entry}
                             epochs={{ ...manifest.epochs, ...L.epochNames }}
                             labels={{ layerNames: L.layerNames, telemetry: L.telemetry, baselineEpoch: L.baselineEpoch,
                                       targetEpoch: L.targetEpoch, compareHint: L.compareHint }} />
                  )}
                  {m.role === "assistant" && m.text && ttsSupported && !(busy && i === messages.length - 1) && (
                    <button
                      type="button"
                      className="pa-listen"
                      onClick={() => playMessage(i, m.text)}
                      aria-label={speakingIdx === i ? L.stop : L.listen}
                      title={speakingIdx === i ? L.stop : L.listen}
                    >
                      {speakingIdx === i ? <Square size={12} /> : <Volume2 size={14} />}
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </main>

      <div className="pa-dock">
        <form className="pa-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={L.placeholder}
            aria-label={L.placeholder}
          />
          <button type="submit" disabled={!input.trim() || busy} aria-label="Send">
            <ArrowUp size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
