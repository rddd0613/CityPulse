import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// تعليمات النموذج: غيّرها براحتك
const HEAD = `You are PULSE AI, the assistant inside City Pulse, an app that uses NASA and satellite data to show how Saudi cities have changed over time (timeline of four epochs: 2013 Baseline, 2015 Expansion, 2020 Green Riyadh, 2025 Present). It tracks three indicators: Surface Heat, Vegetation, and Urbanization.
Rules:
- Reply in the same language the user writes in (Arabic or English).
- Keep answers short, simple and clear, for a non-expert.
- If the user asks about "this area" or a place without naming a city or neighborhood and no selected area is given below, ask which city or area they mean. Do not list or suggest example cities.
- Write plain text only. Do not use markdown symbols such as ** or #.
- When you explain patterns, describe how the indicators moved together (for example heat rising while urbanization grows and vegetation falls), and make clear this is an association in the data, not proof that one caused the other.`;

const NO_DATA = `
- No city data is connected to you yet. Never invent exact numbers, percentages or dates for specific cities or neighborhoods. Give general, well-known context instead, and say when exact figures need the app's data.`;

const WITH_DATA = `
- Answer questions about city change ONLY from the DATA section below. Quote exact values with their units and years. If the DATA does not contain what was asked, say so plainly and do not guess. You may add brief general context, clearly separated from the data.
- The DATA lists cities. Each city has neighborhoods and a summary, and the summary is only the average of the listed neighborhoods, so say that when you quote a city-level figure.
- Indicators: heat = lst_c (surface temperature in Celsius), vegetation = ndvi (higher means greener), urbanization = built_pct (percent built-up). vs_2025 holds the change from each earlier epoch (2013, 2015, 2020) to 2025, matching the app's Compare screen, with a trend for each indicator (strong_up, up, flat, down, strong_down). Convert temperatures if the user prefers Fahrenheit.
- If the DATA has "_demo": true, begin your answer by saying these are demo sample values, not real measurements.
- If meta.notes contain a caveat that matters for the answer (for example that 2025 built-up values are modelled estimates), mention it briefly.`;

// يقرأ data/city-data.json في كل طلب (تقدر تعدّل الملف بدون إعادة تشغيل). لو غير موجود يرجع null.
function loadCityData() {
  try {
    const raw = readFileSync(resolve(process.cwd(), "data/city-data.json"), "utf-8");
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return null;
  }
}

function buildSystem(settings = {}) {
  const data = loadCityData();
  const area = typeof settings.area === "string" ? settings.area.trim().slice(0, 120) : "";
  const unit = settings.unit === "F" ? "Fahrenheit (°F)" : "Celsius (°C)";
  return HEAD + (data ? WITH_DATA : NO_DATA) + `
- Use ${unit} for temperatures.` + (area ? `
- The user currently has this area selected in the app: ${area}. Treat "this area" as that place.` : "") + (data ? `

DATA (JSON):
${data}` : "");
}


// يستقبل الطلب من التطبيق ويرسله لـ Gemini. المفتاح يبقى هنا ولا يوصل للمتصفح.
function chatApi(env) {
  return {
    name: "chat-api",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        const key = env.GEMINI_API_KEY;
        if (!key || key.includes("PASTE")) {
          res.statusCode = 500;
          return res.end("Missing API key. Add it to the .env file, then restart npm run dev.");
        }
        try {
          let body = "";
          for await (const c of req) body += c;
          const { messages = [], settings = {} } = JSON.parse(body);
          const system = buildSystem(settings);
          const contents = messages
            .filter((m) => m.text)
            .map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.text }],
            }));

          // يجرّب النماذج بالترتيب لين يشتغل واحد (أسماء النماذج تتغير وأحياناً يكون النموذج مزدحم)
          const models = [
            ...new Set([env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.5-flash"].filter(Boolean)),
          ];
          const payload = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents });
          let upstream;
          for (const model of models) {
            upstream = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: payload,
              }
            );
            if (upstream.ok) break;
            if (![404, 429, 500, 503].includes(upstream.status)) break;
            await new Promise((r) => setTimeout(r, 800));
          }

          if (!upstream.ok) {
            const code = upstream.status;
            res.statusCode = code === 429 ? 429 : 502;
            return res.end(
              code === 429
                ? "Too many requests. Wait a minute and try again."
                : code === 503 || code === 500
                ? "The AI service is busy right now. Try again in a minute."
                : code === 404
                ? "No available model. Set GEMINI_MODEL in the .env file."
                : `AI service error (${code}). Check your API key.`
            );
          }

          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          const decoder = new TextDecoder();
          let buf = "";
          for await (const chunk of upstream.body) {
            buf += decoder.decode(chunk, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop();
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              try {
                const parts = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts ?? [];
                const text = parts.map((p) => p.text || "").join("");
                if (text) res.write(text);
              } catch {
                /* تجاهل الأسطر الناقصة */
              }
            }
          }
          res.end();
        } catch {
          if (!res.headersSent) res.statusCode = 500;
          res.end("Server error.");
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return { plugins: [react(), chatApi(env)] };
});
