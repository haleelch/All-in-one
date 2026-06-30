// /api/ai.js
// Vercel serverless function (Node.js runtime).
// Receives { task, text } from the frontend and calls Google's Gemini API
// server-side, so the API key never reaches the browser.
//
// Required environment variable (set in Vercel → Project → Settings →
// Environment Variables): GEMINI_API_KEY

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Builds the system-style instruction text for each supported task.
// Gemini's REST API doesn't have a separate "system" field in the basic
// request shape we use here, so we prepend instructions to the prompt.
function buildPrompt(task, text) {
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

  // Fallback for any future/unknown task: treat text as a generic prompt.
  return text;
}

// Extracts plain text out of Gemini's response, and trims accidental
// markdown code fences if the model added them anyway.
function extractText(geminiJson) {
  const candidate = geminiJson && geminiJson.candidates && geminiJson.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  if (!parts || !parts.length) return '';
  let out = parts.map(p => p.text || '').join('').trim();
  // Strip ```html / ``` fences if the model wrapped its answer in one.
  out = out.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  return out;
}

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
  // On some runtimes req.body may arrive as a raw string; parse defensively.
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

  const prompt = buildPrompt(task, text);

  try {
    const geminiResp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });

    const data = await geminiResp.json().catch(() => ({}));

    if (!geminiResp.ok) {
      const message = (data && data.error && data.error.message) || `Gemini API request failed (${geminiResp.status}).`;
      res.status(502).json({ error: message });
      return;
    }

    const result = extractText(data);
    if (!result) {
      res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
      return;
    }

    res.status(200).json({ result });
  } catch (err) {
    res.status(502).json({ error: `Could not reach Gemini: ${err.message || 'unknown error'}.` });
  }
};
