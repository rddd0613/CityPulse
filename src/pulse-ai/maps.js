// خرائط المدن: كشف المدينة من سؤال المستخدم + قراءة قائمة الصور (manifest) اللي يطلعها سكربت البيانات.

// تطبيع بسيط للعربي عشان "جدة" و"جده" و"الرياض" تنطابق
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

// أسماء المدن (وأحياء مميزة فقط، عشان أسماء مثل "الروضة" موجودة في أكثر من مدينة وما نخمّن)
const ALIASES = {
  Riyadh: ["riyadh", "الرياض", "malqa", "الملقا", "hittin", "حطين", "narjis", "النرجس"],
  Jeddah: ["jeddah", "jiddah", "jidda", "جده", "obhur", "ابحر"],
  Dammam: ["dammam", "الدمام", "adamah", "العدامه"],
};

/** يرجع اسم المدينة ("Riyadh" | "Jeddah" | "Dammam") أو null. لو ذكر أكثر من مدينة يختار الأولى في الجملة. */
export function detectCity(text) {
  const t = norm(text);
  let best = null;
  let at = Infinity;
  for (const [city, words] of Object.entries(ALIASES)) {
    for (const w of words) {
      const i = t.indexOf(norm(w));
      if (i !== -1 && i < at) {
        best = city;
        at = i;
      }
    }
  }
  return best;
}

let cache;
/** يقرأ /maps/manifest.json مرة وحدة. لو الملف غير موجود يرجع null (والتطبيق يشتغل عادي بدون خرائط). */
export function loadManifest() {
  cache ??= fetch("/maps/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null))
    .catch(() => null);
  return cache;
}
