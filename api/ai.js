// /api/ai.js
// Vercel serverless function (Node.js runtime).
// Receives { task, text } from the frontend and calls Google's Gemini API
// server-side, so the API key never reaches the browser.
//
// Required environment variable (set in Vercel → Project → Settings →
// Environment Variables): GEMINI_API_KEY

const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ============================================================
// Shared helpers
// ============================================================

// Extracts plain text out of Gemini's response, and trims accidental
// markdown code fences if the model added them anyway.
function extractText(geminiJson) {
  const candidate = geminiJson && geminiJson.candidates && geminiJson.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  if (!parts || !parts.length) return '';
  let out = parts.map(p => p.text || '').join('').trim();
  out = out.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  return out;
}

// Extracts the first inline base64 image out of a Gemini image-generation
// response, along with its mime type. Returns null if none found.
function extractImage(geminiJson) {
  const candidate = geminiJson && geminiJson.candidates && geminiJson.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  if (!parts) return null;
  for (const p of parts) {
    if (p.inlineData && p.inlineData.data) {
      return { data: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' };
    }
  }
  return null;
}

async function callGeminiText(apiKey, prompt, { json } = {}) {
  const url = `${GEMINI_BASE}/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`;
  const generationConfig = { temperature: 0.4 };
  if (json) generationConfig.responseMimeType = 'application/json';

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = (data && data.error && data.error.message) || `Gemini text request failed (${resp.status}).`;
    throw new Error(message);
  }
  const result = extractText(data);
  if (!result) throw new Error('Gemini returned an empty response.');
  return result;
}

async function callGeminiImage(apiKey, prompt) {
  const url = `${GEMINI_BASE}/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = (data && data.error && data.error.message) || `Gemini image request failed (${resp.status}).`;
    throw new Error(message);
  }
  const image = extractImage(data);
  if (!image) throw new Error('Gemini did not return an image.');
  return image;
}

// ============================================================
// TASK: grammar_fix / document_format — existing simple text tasks
// ============================================================
function buildSimplePrompt(task, text) {
  if (task === 'grammar_fix') {
    return `You are a careful proofreader. Rewrite the text below, fixing grammar, spelling, and punctuation mistakes only. Keep the author's meaning, tone, and structure unchanged — do not rephrase sentences that are already correct.

After the corrected text, on a new line, write exactly "CHANGES:" followed by a short bullet-style list summarizing what you changed. If nothing needed fixing, write "No changes needed." after CHANGES:.

Text to correct:
"""
${text}
"""`;
  }

  if (task === 'document_format') {
    return `You are formatting plain text into a clean, simple HTML document for a Word export. Convert the text below into well-structured HTML.

Rules:
- Use ONLY these tags: h1, h2, h3, p, table, tr, td, th, strong, em, ul, li
- Do not include <html>, <head>, <body>, <script>, <style>, or any other tags
- Do not include markdown code fences — return raw HTML only, nothing else
- Infer a sensible title (h1) and section headings (h2/h3) from the content where appropriate
- Keep paragraphs as <p> tags
- Use a <table> only if the content is naturally tabular (e.g. lists of items with values); otherwise use <p> and <ul>/<li>

Text to format:
"""
${text}
"""

Return only the HTML, with no explanation before or after it.`;
  }

  return text;
}

async function handleSimpleTask(apiKey, task, text) {
  const prompt = buildSimplePrompt(task, text);
  const result = await callGeminiText(apiKey, prompt);
  return { result };
}

// ============================================================
// TASK: ppt_generate — topic -> structured slide deck (+ images)
// ============================================================

// Asks Gemini for a structured outline as strict JSON:
// { title, subtitle, slides: [{ title, bullets: [...], image_prompt: string|null }] }
// image_prompt is null/omitted for slides that don't need an image.
async function generateDeckOutline(apiKey, topic) {
  const prompt = `You are an expert presentation writer. Create a presentation outline for this topic:

"""
${topic}
"""

Requirements:
- Produce between 8 and 12 slides (not counting the title slide).
- Each slide needs a short, clear title (max ~8 words) and 2-5 concise bullet points (max ~14 words each).
- For slides where a supporting image would genuinely help (e.g. a concept, process, object, scene, comparison — NOT for purely numeric/agenda/summary slides), include an "image_prompt": a vivid, specific, safe-for-work description suitable for an AI image generator. Use image_prompt for roughly 3 to 6 of the slides — choose the ones where a picture adds real value, not every slide.
- For slides that don't need an image, omit "image_prompt" entirely (or set it to null).
- Match the language of the topic — if the topic is in Malayalam, write slide titles and bullets in Malayalam; if in English, use English.

Return ONLY valid JSON, no markdown fences, no explanation, matching exactly this shape:
{
  "title": "Deck title",
  "subtitle": "Short subtitle or tagline",
  "slides": [
    { "title": "Slide title", "bullets": ["point one", "point two"], "image_prompt": "description or null" }
  ]
}`;

  const raw = await callGeminiText(apiKey, prompt, { json: true });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI returned an unexpected format for the outline. Please try again.');
  }

  if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    throw new Error('AI did not return any slides. Please try again.');
  }

  // Defensive normalization + hard cap so a runaway response can't blow up
  // build time or cost.
  const slides = parsed.slides.slice(0, 14).map(s => ({
    title: String(s.title || 'Untitled slide').slice(0, 120),
    bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 6).map(b => String(b).slice(0, 200)) : [],
    image_prompt: (s.image_prompt && typeof s.image_prompt === 'string' && s.image_prompt.trim())
      ? s.image_prompt.trim().slice(0, 300)
      : null,
  }));

  return {
    title: String(parsed.title || topic).slice(0, 150),
    subtitle: parsed.subtitle ? String(parsed.subtitle).slice(0, 200) : '',
    slides,
  };
}

// Generates images for every slide that has an image_prompt, in parallel,
// and attaches { image: { data, mimeType } } onto the slide object. Any
// single image failure is swallowed (slide just goes without an image)
// rather than failing the whole deck.
async function attachImages(apiKey, deck) {
  const jobs = deck.slides.map(async (slide) => {
    if (!slide.image_prompt) return;
    try {
      const stylePrompt = `${slide.image_prompt}. Style: clean, modern, presentation-friendly illustration, no text or words in the image, no watermarks, simple background.`;
      slide.image = await callGeminiImage(apiKey, stylePrompt);
    } catch (err) {
      // Non-fatal — the slide just renders without an image.
      slide.image = null;
      slide.image_error = err.message;
    }
  });
  await Promise.all(jobs);
  return deck;
}

async function handlePptGenerate(apiKey, topic) {
  const deck = await generateDeckOutline(apiKey, topic);
  await attachImages(apiKey, deck);
  return { result: deck };
}

// ============================================================
// Request handler
// ============================================================
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Set it in Vercel → Project Settings → Environment Variables, then redeploy.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { task, text } = body || {};

  if (!task || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Request must include a "task" and non-empty "text".' });
    return;
  }
  if (text.length > 20000) {
    res.status(400).json({ error: 'Text is too long (max ~20,000 characters).' });
    return;
  }

  try {
    let payload;
    if (task === 'ppt_generate') {
      payload = await handlePptGenerate(apiKey, text);
    } else {
      payload = await handleSimpleTask(apiKey, task, text);
    }
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Something went wrong talking to Gemini.' });
  }
};
