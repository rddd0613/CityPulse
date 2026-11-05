// قراءة الردود بصوت عالٍ (Text-to-Speech) عبر المتصفح، بدون API ولا تكلفة.
// الأصوات العربية تعتمد على جهاز المستخدم (Edge وChrome على ويندوز وأندرويد وآيفون عندهم أصوات عربية عادة).

export const ttsSupported =
  typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

let token = 0; // يمنع أي نداء متأخر من إيقاف قراءة جديدة بالغلط

const isArabic = (s) => /[\u0600-\u06FF]/.test(s);

// يشيل رموز التنسيق عشان ما تنقرأ ("نجمة نجمة")
function clean(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>~|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Chrome يقطع الجمل الطويلة بعد ثواني، فنقسم النص لقطع قصيرة
function chunk(text, max = 180) {
  const sentences = text.match(/[^.!?؟۔\n]+[.!?؟۔]?/g) || [text];
  const out = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      for (const w of s.split(/\s+/)) {
        if ((cur + " " + w).length > max) flush();
        cur += (cur ? " " : "") + w;
      }
      flush();
      continue;
    }
    if ((cur + s).length > max) flush();
    cur += s + " ";
  }
  flush();
  return out;
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const norm = (v) => v.lang.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => norm(v) === lang.toLowerCase()) ||
    voices.find((v) => norm(v).startsWith(lang.slice(0, 2).toLowerCase())) ||
    null
  );
}

/** يقرأ النص. يرجع true لو بدأت القراءة. onEnd تُستدعى لما تخلص أو تنوقف. */
export function speak(text, onEnd) {
  if (!ttsSupported) return false;
  const synth = window.speechSynthesis;
  token += 1;
  const mine = token;
  synth.cancel();

  const plain = clean(text);
  if (!plain) return false;
  const lang = isArabic(plain) ? "ar-SA" : "en-US";
  const voice = pickVoice(lang);
  const parts = chunk(plain);

  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = lang;
    if (voice) u.voice = voice;
    if (i === parts.length - 1) {
      const done = () => mine === token && onEnd?.();
      u.onend = done;
      u.onerror = done;
    }
    synth.speak(u);
  });
  return true;
}

export function stopSpeaking() {
  if (!ttsSupported) return;
  token += 1;
  window.speechSynthesis.cancel();
}
