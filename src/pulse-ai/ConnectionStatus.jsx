import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import "./ConnectionStatus.css";

/**
 * true لو الجهاز عليه إنترنت والسيرفر يستجيب، وإلا false.
 * يفحص بطلب GET خفيف على /api/chat (يرد 405 بدون ما يستدعي الذكاء الاصطناعي)
 * عند تغيّر حالة الشبكة وكل 30 ثانية.
 */
export function useConnection({ url = "/api/chat", every = 30000 } = {}) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!navigator.onLine) return alive && setOnline(false);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetch(url, { method: "GET", cache: "no-store", signal: ctrl.signal });
        alive && setOnline(true); // أي رد = السيرفر واصل (حتى لو 405)
      } catch {
        alive && setOnline(false);
      } finally {
        clearTimeout(timer);
      }
    };
    const goOffline = () => setOnline(false);
    check();
    const id = setInterval(check, every);
    window.addEventListener("online", check);
    window.addEventListener("offline", goOffline);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", goOffline);
    };
  }, [url, every]);

  return online;
}

/**
 * سطر الحالة تحت اسم التطبيق.
 *   فيه نت  : نقطة خضراء (وكلمة Connected بالأخضر لو showConnected)
 *   ما فيه  : أيقونة واي فاي مقطوع + كلمة Offline بالبرتقالي (تظهر دايماً)
 */
export default function ConnectionStatus({
  label = "Orbit · Sentinel-2",
  showConnected = true,
  connectedText = "Connected",
  offlineText = "Offline",
}) {
  const online = useConnection();
  const text = online ? (showConnected ? connectedText : null) : offlineText;

  return (
    <div className={`cs ${online ? "on" : "off"}`} role="status" aria-live="polite">
      {online ? <span className="cs-dot" /> : <WifiOff size={11} aria-hidden="true" />}
      <span>{label}</span>
      {text && (
        <>
          <span>·</span>
          <b>{text}</b>
        </>
      )}
    </div>
  );
}
