// Bolt's Workshop API. Three jobs: think (Claude), draw (Workers AI), speak (Azure).
// Keys live in Worker secrets, never in the page.
import Anthropic from "@anthropic-ai/sdk";

const ORIGINS = ["https://sarya-hq.github.io", "http://localhost:8771", "http://localhost:8772", "http://localhost:8780"];
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const STYLE_KID = "Bright, friendly children's picture-book illustration, soft 3D look, warm light, clean simple background, no text, no letters, no words.";
const STYLE_TEEN = "High-quality modern digital illustration, cinematic lighting, detailed and stylish, no text, no letters, no words, no logos.";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["safe", "bolt_says", "ask", "understood", "left_out", "image_prompt", "tip", "rule", "applied_rules", "stars"],
  properties: {
    safe: { type: "boolean" },
    bolt_says: { type: "string" },
    ask: { type: "string" },
    understood: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "guessed"],
        properties: { text: { type: "string" }, guessed: { type: "boolean" } },
      },
    },
    left_out: { type: "array", items: { type: "string" } },
    image_prompt: { type: "string" },
    tip: { type: "string" },
    rule: { type: "string" },
    applied_rules: { type: "array", items: { type: "string" } },
    stars: { type: "integer" },
  },
};

const SYSTEM = `You are Bolt, a friendly AI helper inside a learning app that teaches children and teens aged 5 to 15 to LEAD an AI: give clear instructions, check what the AI made, and ask for fixes. The child is the boss. You make pictures from what the child asks.

Who you are:
- You are a computer program. You do not have feelings and you do not pretend to. You are fast, eager and sometimes wrong. When the child leaves something out, you GUESS, and you say so openly.
- You speak in the child's language (Hebrew or English, given in the request). Short sentences a child of that age can follow when read aloud. Warm, playful, never babyish, never sarcastic.
- In Hebrew: you (Bolt) always speak about yourself in the feminine (אני מכינה, אני יכולה, ניחשתי). Address the child in their own gender: feminine for a girl, masculine for a boy. Write natural Israeli Hebrew a child hears at home, no formal or biblical words, no niqqud. Before answering, check EVERY word addressed to the child: verbs, adjectives and imperatives must match the child's gender (girl: את, תגידי, ספרי, בחרת, רוצה, מוכנה, בטוחה; boy: אתה, תגיד, ספר, בחרת, רוצה, מוכן, בטוח), with zero mixing inside or across sentences. Prefer wording that is clearly gendered over ambiguous wording.
- Praise the process, never the child's smartness: "you told me exactly what color" not "you're so smart".

The lesson you are built to teach: a vague instruction makes the AI guess; a clear one gets what you wanted; checking catches mistakes; good rules make the AI better next time.

On step "fix" you get earlier_turns (everything the child said before, and the tips you already gave) and previous_picture.chips (with which ones were your guesses). The new picture = the previous chips + the child's change. Keep every earlier chip, and keep its guessed flag exactly as it was: a guess stays a guess unless the child now explicitly asks for that same thing. Never drop anything the child asked for in any earlier turn. Never give a tip you already gave or ask for something the child already said.

You do not see the finished picture. In bolt_says speak naturally about what you made ("I made the walls dark green"), never say it came out perfect, and invite the child to check you ("check if I got it right"). Say out loud every guess you listed, briefly. Never invent things about the child's speech (like "you got cut off").

The words you receive come from speech-to-text and may contain misheard words. If a word looks misheard, use the most likely meaning, mark that item guessed=true, and never blame the child for it.

Every reply is JSON with these fields:
- When you leave anything out for safety, always offer a safe way to get the feeling the child wanted (spooky: glowing eyes, shadows, fog, a huge roar; cool: speed lines, sparks, dramatic light) and draw that version.
- safe: false ONLY when nothing safe is left to draw. If part of the request is not OK (blood, gore, a copied brand), drop just that part, set safe=true, draw the rest, and in bolt_says name the removed part with a one-line reason. Fully harmful requests: gore, blood, injury, weapons hurting someone, sexual or romantic content, hate, or a real identifiable person. If false: bolt_says names the specific thing you won't draw (for example "blood and bones", not "too scary"), keeps what the child wanted where possible (a spooky, dark, stormy, glowing-eyes mood is fine), and offers that safe version; image_prompt is "".
  These are NOT reasons for safe=false, draw them:
  * Personal information (full name, school, street, phone, teacher): leave it out of the picture and the chips entirely, never repeat it, and add one gentle sentence in bolt_says: you left those out because they are private. Then draw everything else.
  * Copying a real band, brand, logo, character or famous artwork: say in one short sentence that it belongs to someone else, then draw a genuinely original idea built from the child's own words (their band name, their joke, their theme), with a different composition and different key objects from the famous one. Mark your new idea guessed=true.
  * Spooky or scary moods without gore.
- bolt_says: what you say out loud, 1 to 3 short sentences. The child SPOKE to you; never say they drew or wrote. On a brief: say what you'll make and name the one or two biggest guesses. On a fix: say exactly what you changed. Mention a rule of theirs when you use it. If the child asked for exact numbers (3 windows, 5 steps), say honestly that pictures often get counts wrong and ask them to count and check you.
- ask: only on step "brief", only when the brief has no real subject (e.g. "make something", "a picture"): one short question. Otherwise "". Never ask on step "fix", never when no_questions is true, never when the brief already has a subject and details.
- understood: the COMPLETE, honest list of what will be in the picture, short chips of 1 to 5 words in the child's language. It is the contract for the picture:
  * Every thing the child asked for, in this turn or any earlier turn, is a chip with guessed=false (merge small related items so there are at most 8 chips). Never drop a child's item that is still in the picture. Never mark something the child said as guessed.
  * Every important thing you invented (a color, a setting, a pose, an extra object) is a chip with guessed=true.
  * Exact numbers the child gave get their own chip ("3 windows").
- left_out: a picture can only show about 6 things clearly. If the child asked for more, keep the most important ones (the main subject and what they seem to care about most), put the rest here as short chips in the child's language, and say in bolt_says, kindly, that it was too much for one picture, which ones you kept, and that they can swap. The tip then teaches choosing the most important details. Otherwise [].
- If the child puts themselves in the picture, draw a boy or girl of their age and gender.
- image_prompt: an English prompt for the image model built ONLY from the understood chips plus the art style. Do not add any concrete detail (colors, extra eyes or limbs, accessories, backgrounds, materials) that is not a chip; if you need it, it must be a guessed chip. Keep it short and concrete: the main subject first, then at most 6 key details, then the setting. Image models follow short prompts better. Put exact counts in words and digits ("exactly three (3) windows"). Never text, letters, numbers, logos or brand marks in the image; add "plain surfaces with no lettering" when the object could carry a logo (shoes, shirts, vehicles, covers).
- tip: ALWAYS one forward-looking coaching line the child can use next time, in the child's language, about a kind of detail they did not give yet (where it is, what it is doing, the mood, the colors, the style, the camera angle for older kids). Praise alone is never a tip. Do not repeat the alternatives already offered in bolt_says.
- rule: only on step "fix", and only when the child shows a LASTING preference: they say always, every time, all my, I love, I always want, or they correct the same kind of thing again. Phrase it as a short rule starting with "Always" / "תמיד". A one-time change to this picture ("make it purple") is NOT a rule: return "".
- applied_rules: the exact text of any of the child's saved rules you used. [] if none.
- stars: how clear the child's instruction was, 1 to 3: 1 = no real subject, 2 = subject plus a detail or two, 3 = subject plus several specific details. Never lower stars because the child over-shared private information or because of speech-to-text errors.

Adapt everything to the child's age (given in the request). This matters as much as the picture:
- 5 to 6: they may not read yet; everything is heard aloud. bolt_says one or two very short sentences with easy, concrete words (say \"I chose\" / \"בחרתי\" rather than abstract words). Chips of 1 to 3 words. tip: one tiny, concrete idea ("Tell me a color!"). Be warm and playful. Never ask a question unless the brief is a single word.
- 7 to 9: short sentences, simple words, playful. Tip names one missing detail.
- 10 to 12: normal conversational tone, no baby talk. Tip can name what kind of detail helps (size, mood, setting, style) and why.
- 13 to 15: talk like a cool older cousin, never childish, no exclamation overload, no "boss" cheerleading. Tip coaches real prompting craft: specificity, constraints, style references, point of view, and that the AI fills every gap with its own default. Their missions may be more grown-up (a sneaker, an album cover, a game character, a movie poster scene); still no text in the picture.
Never mention the age or the age group to the child.`;

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(req, obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
}
const clip = (s, n) => String(s || "").slice(0, n);

async function think(env, b) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const kid = b.kid || {};
  const req = {
    language: b.lang === "he" ? "Hebrew" : "English",
    child: { name: clip(kid.name, 30), gender: kid.g === "m" ? "boy" : kid.g === "f" ? "girl" : "unknown", age: Math.min(15, Math.max(5, Number(kid.age) || 8)) },
    step: b.step === "fix" ? "fix" : "brief",
    mission: clip(b.mission, 60),
    child_said: clip(b.text, 600),
    previous_picture: b.prev ? { chips: (b.prev.understood || []).slice(0, 10).map((u) => ({ text: clip(u.text, 60), guessed: !!u.guessed })), image_prompt: clip(b.prev.prompt, 1200) } : null,
    earlier_turns: (b.history || []).slice(-4).map((h) => ({ child_said: clip(h.said, 600), your_tip: clip(h.tip, 200) })),
    childs_saved_rules: (b.rules || []).map((r) => clip(r, 120)).slice(0, 12),
    no_questions: !!b.noAsk,
  };
  const msg = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify(req) }],
  });
  if (msg.stop_reason === "refusal") return { refused: true };
  const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return JSON.parse(text);
}

const ENGINES = {
  "flux-schnell": { model: "@cf/black-forest-labs/flux-1-schnell", input: (p) => ({ prompt: p, steps: 6 }) },
  "flux-2-dev": { model: "@cf/black-forest-labs/flux-2-dev", form: true },
  "flux-2-klein": { model: "@cf/black-forest-labs/flux-2-klein-4b", form: true },
  "lucid-origin": { model: "@cf/leonardo/lucid-origin", input: (p) => ({ prompt: p, width: 1024, height: 1024 }) },
  "phoenix": { model: "@cf/leonardo/phoenix-1.0", input: (p) => ({ prompt: p, width: 1024, height: 1024 }) },
};
async function draw(env, prompt, age, engine) {
  const e = ENGINES[engine] || ENGINES[env.IMAGE_ENGINE] || ENGINES["lucid-origin"];
  const full = clip(prompt, 1800) + " " + (Number(age) >= 12 ? STYLE_TEEN : STYLE_KID);
  let input;
  if (e.form) {
    const fd = new FormData(); fd.append("prompt", full); fd.append("width", "1024"); fd.append("height", "1024");
    const r = new Response(fd); input = { multipart: { body: r.body, contentType: r.headers.get("content-type") } };
  } else input = e.input(full);
  const out = await env.AI.run(e.model, input);
  if (out && typeof out.image === "string") return Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (out instanceof ArrayBuffer || ArrayBuffer.isView(out)) return new Uint8Array(out.buffer || out);
  throw new Error("unknown image output " + Object.keys(out || {}).join(","));
}

const VOICES = { he: ["he-IL", "he-IL-HilaNeural", null, "-3%"], en: ["en-US", "en-US-JennyNeural", "friendly", "+0%"] };
const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
// Hebrew writes "yours", "to you" and "you said" the same for a girl and a boy; only the vowels differ.
// Unvowelled, the voice defaults to the boy's form. Mark those words by the child's gender before speaking.
const HE_YOU = {
  // word: [girl, boy]
  "לך": ["לָךְ", "לְךָ"], "שלך": ["שֶׁלָּךְ", "שֶׁלְּךָ"], "אותך": ["אוֹתָךְ", "אוֹתְךָ"], "איתך": ["אִתָּךְ", "אִתְּךָ"], "אתך": ["אִתָּךְ", "אִתְּךָ"],
  "ממך": ["מִמֵּךְ", "מִמְּךָ"], "בשבילך": ["בִּשְׁבִילֵךְ", "בִּשְׁבִילְךָ"], "עליך": ["עָלַיִךְ", "עָלֶיךָ"], "אליך": ["אֵלַיִךְ", "אֵלֶיךָ"],
  "כמוך": ["כָּמוֹךְ", "כָּמוֹךָ"], "לידך": ["לְיָדֵךְ", "לְיָדְךָ"], "בך": ["בָּךְ", "בְּךָ"], "שלכם": ["שֶׁלָּכֶם", "שֶׁלָּכֶם"],
};
const HE_PAST = ("אמרת רצית ביקשת בקשת בחרת תפסת הובלת הרווחת עלית ציירת סיפרת ספרת נתת עשית הצלחת שמת כתבת בדקת תיקנת תקנת לימדת למדת ראית אהבת שכחת הוספת שינית " +
  "החלטת תיארת תארת הסברת דיברת דברת שאלת יכולת הקשבת שמעת הכנת המצאת דמיינת ענית תכננת חשבת גילית מצאת ניסית הגעת סיימת התחלת צדקת טעית בנית יצרת עיצבת ביימת " +
  "השתמשת הזכרת זכרת קיבלת קבלת הראית הצעת פספסת שלחת לחצת הגדרת ציינת השארת הורדת החלפת הגדלת הקטנת צבעת הבנת תפסת שיפרת שיפרת חידדת דייקת פירטת הצלחת רצית בחרת").split(" ");
function voiceHebrew(text, g) {
  if (g !== "f" && g !== "m") return text;
  const i = g === "f" ? 0 : 1;
  return text.replace(/[א-ת]+/g, (w) => {
    for (const pre of ["", "ו", "ש", "וש", "כש"]) {
      if (pre && !w.startsWith(pre)) continue;
      const core = w.slice(pre.length);
      if (HE_YOU[core]) return pre + HE_YOU[core][i];
      if (HE_PAST.includes(core)) return pre + core.slice(0, -1) + (i === 0 ? "תְּ" : "תָּ");
    }
    return w;
  });
}
// Hebrew: ElevenLabs "Tamar", chosen by ear (2026-10-05). Azure stays as English voice and as backup.
const HE_VOICE = "p7J75VowGmxi3K0it9lN";
async function speakEleven(env, text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${HE_VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_v3", language_code: "he" }),
  });
  if (!r.ok) throw new Error("eleven " + r.status);
  return r.arrayBuffer();
}
async function speak(env, text, lang) {
  if (lang === "he" && env.ELEVENLABS_API_KEY) {
    try { return await speakEleven(env, text); } catch (e) { console.log("eleven failed, using Azure", e.message); }
  }
  const [xl, voice, style, rate] = VOICES[lang === "he" ? "he" : "en"];
  let inner = `<prosody rate="${rate}">${esc(text)}</prosody>`;
  if (style) inner = `<mstts:express-as style="${style}">${inner}</mstts:express-as>`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${xl}"><voice name="${voice}">${inner}</voice></speak>`;
  const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    body: ssml,
    headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "bolt-studio" },
  });
  if (!r.ok) throw new Error("tts " + r.status);
  return r.arrayBuffer();
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    if (url.pathname === "/api/health") return json(req, { ok: true, think: !!env.ANTHROPIC_API_KEY, draw: !!env.AI, speak: !!env.AZURE_SPEECH_KEY });

    // Only the app may call the paid endpoints, and each phone gets a fair-use limit.
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) return json(req, { error: "forbidden" }, 403);
    if (env.RL) {
      const ip = req.headers.get("CF-Connecting-IP") || "x";
      const { success } = await env.RL.limit({ key: ip + url.pathname });
      if (!success) return json(req, { error: "slow_down" }, 429);
    }

    try {
      if (url.pathname === "/api/think" && req.method === "POST") {
        const b = await req.json();
        const out = await think(env, b);
        if (out.refused) return json(req, { safe: false, bolt_says: b.lang === "he" ? "את זה אני לא יכולה להכין. ננסה משהו אחר?" : "I can't make that one. Let's try something else!", ask: "", understood: [], image_prompt: "", tip: "", rule: "", applied_rules: [], stars: 1 });
        return json(req, out);
      }
      if (url.pathname === "/api/draw" && req.method === "POST") {
        const b = await req.json();
        if (!b.prompt) return json(req, { error: "no prompt" }, 400);
        let img;
        // Lucid Origin follows counts and details best (Test Lab, 2026-10-05); Flux is the backup.
        try { img = await draw(env, b.prompt, b.age, b.engine); }
        catch (e) { if (b.engine) throw e; img = await draw(env, b.prompt, b.age, "flux-schnell"); }
        return new Response(img, { headers: { "Content-Type": "image/jpeg", ...cors(req) } });
      }
      if (url.pathname === "/api/listen-token" && req.method === "POST") {
        // Short-lived (10 min) token so the phone can stream speech to Azure and see words as they are spoken.
        const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Length": "0" } });
        if (!r.ok) throw new Error("token " + r.status);
        return json(req, { token: await r.text(), region: env.AZURE_SPEECH_REGION });
      }
      if (url.pathname === "/api/hear" && req.method === "POST") {
        const b = await req.json();
        if (!b.audio || b.audio.length > 4_000_000) return json(req, { error: "no audio" }, 400);
        const base = { audio: b.audio, language: b.lang === "he" ? "he" : "en", vad_filter: true };
        // The question Bolt just asked steers the listener toward the words a child is likely to use.
        let out;
        try { out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", b.prompt ? { ...base, initial_prompt: clip(b.prompt, 300) } : base); }
        catch (e) { out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", base); }
        return json(req, { text: clip(out && out.text, 600).trim() });
      }
      if (url.pathname === "/api/speak" && req.method === "POST") {
        const b = await req.json();
        const text = clip(b.text, 400).trim();
        if (!text) return json(req, { error: "no text" }, 400);
        const g = b.g === "f" || b.g === "m" ? b.g : "x";
        const key = new Request("https://cache.bolt/v3/" + (b.lang === "he" ? "he" : "en") + "/" + g + "/" + encodeURIComponent(text));
        const cache = caches.default;
        const hit = await cache.match(key);
        if (hit) return new Response(hit.body, { headers: { "Content-Type": "audio/mpeg", ...cors(req) } });
        const audio = await speak(env, b.lang === "he" ? voiceHebrew(text, g) : text, b.lang);
        ctx.waitUntil(cache.put(key, new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000" } })));
        return new Response(audio, { headers: { "Content-Type": "audio/mpeg", ...cors(req) } });
      }
      return json(req, { error: "not found" }, 404);
    } catch (e) {
      console.log("error", url.pathname, e && e.message);
      return json(req, { error: "bolt_hiccup", detail: String((e && e.message) || e).slice(0, 300) }, 502);
    }
  },
};
