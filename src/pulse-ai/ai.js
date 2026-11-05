// ai.js — الواجهة الوحيدة اللي يكلّم منها التطبيق الذكاء الاصطناعي.
// الآن: ردود عامة تجريبية. لاحقاً: غيّر USE_MOCK إلى false واربطها بالسيرفر.

const USE_MOCK = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isArabic = (s) => /[\u0600-\u06FF]/.test(s);

function mockReply(question) {
  if (isArabic(question)) {
    return "هذا رد عام تجريبي. بيانات الأقمار الصناعية والخرائط لسا ما انربطت، لذلك ما أقدر أعطيك أرقاماً دقيقة عن " +
      "تغيّر المدينة الحين. بعد ما نضيف البيانات بجاوبك بأرقام لكل حي من 2013 إلى 2025.";
  }
  return "This is a general demo reply. Satellite data and maps aren't connected yet, so I can't give you exact " +
    "figures about how the city has changed. Once the data is added, I'll answer with per-neighborhood numbers from 2013 to 2025.";
}

/**
 * @param {{role:'user'|'assistant', text:string}[]} history  المحادثة كاملة (آخر رسالة للمستخدم)
 * @param {{onToken:(chunk:string)=>void, signal?:AbortSignal}} opts
 */
export async function askAI(history, { onToken, signal, settings }) {
  const last = history[history.length - 1].text;

  if (USE_MOCK) {
    await wait(500);
    for (const word of mockReply(last).split(" ")) {
      if (signal?.aborted) return;
      onToken(word + " ");
      await wait(35);
    }
    return;
  }

  // الربط الحقيقي: لا تحط مفتاح API في الواجهة أبداً، مرّر الطلب عبر سيرفر خاص فيك.
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history, settings }),
    signal,
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}
