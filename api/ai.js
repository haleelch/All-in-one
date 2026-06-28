// /api/ai.js
// Vercel serverless function — runs on the server, never in the browser.
// The Gemini API key lives ONLY here, as an environment variable, so it's
// never visible in page source, devtools, or network tab on the client.
//
// SETUP (one-time, on Vercel):
//   1. Go to your Vercel project → Settings → Environment Variables
//   2. Add a variable named  GEMINI_API_KEY  with your Gemini key as the value
//   3. Redeploy the project so the function picks up the new env var
//
// Get a free Gemini key at: https://aistudio.google.com/app/apikey
//
// The browser calls POST /api/ai with { task, text } and gets back
// { result } or { error }. It never sees the key or talks to Google directly.

export default async function handler(req, res) {
  // Basic CORS / method guard
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'Server is missing GEMINI_API_KEY. Add it in Vercel → Project Settings → Environment Variables, then redeploy.'
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { task, text } = body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'No text provided.' });
    return;
  }
  if (text.length > 12000) {
    res.status(400).json({ error: 'Text is too long. Please shorten it (12,000 character limit).' });
    return;
  }

  const prompts = {
    grammar_fix:
      'You are a careful proofreader. Rewrite the following text correcting all grammar, spelling, ' +
      'and punctuation mistakes. Keep the original meaning, tone, and language exactly the same — ' +
      'only fix mechanical errors. Then on a new line starting with "CHANGES:", briefly list what you ' +
      'changed as a short bullet list (max 6 bullets, each under 12 words). ' +
      'Return ONLY the corrected text, then the CHANGES section. No preamble, no markdown formatting.\n\n' +
      'TEXT:\n' + text,

    document_format:
      'You are a document formatting assistant. Take the following raw text/notes and restructure it into ' +
      'a clean, well-organized HTML document fragment (use only <h1> <h2> <h3> <p> <ul> <li> <table> <tr> <td> <th> <strong> <em> tags, ' +
      'inline style attributes for spacing/borders/colors are allowed, no <html>/<head>/<body> tags, no scripts). ' +
      'Infer the most sensible structure from the content itself (this could be a list, a register, notes, an article, etc). ' +
      'Use clear headings, logical grouping, and tables where the content is tabular. Return ONLY the HTML fragment, nothing else.\n\n' +
      'TEXT:\n' + text,
  };

  const prompt = prompts[task];
  if (!prompt) {
    res.status(400).json({ error: 'Unknown task.' });
    return;
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      }
    );

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error('Gemini API error:', upstream.status, errBody);
      let hint = 'Please try again in a moment.';
      if (upstream.status === 400) hint = 'The request was malformed or the API key is invalid.';
      if (upstream.status === 403) hint = 'The API key may be invalid or restricted.';
      if (upstream.status === 404) hint = 'The AI model name is no longer available — this needs a code update.';
      if (upstream.status === 429) hint = 'Rate limit reached. Wait a minute and try again.';
      res.status(502).json({ error: `The AI service returned an error (HTTP ${upstream.status}). ${hint}` });
      return;
    }

    const data = await upstream.json();
    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      res.status(502).json({ error: 'The AI did not return a usable result. Please try again.' });
      return;
    }

    res.status(200).json({ result: resultText.trim() });
  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ error: 'Something went wrong reaching the AI service.' });
  }
      }
