# Student Utility Hub — Deploy Guide

## ഫയലുകൾ
```
student-utility-hub/
├── index.html      ← പേജ് (design + layout)
├── app.js          ← എല്ലാ ടൂളിന്റെയും logic
├── vercel.json     ← Vercel config
└── api/
    └── ai.js       ← AI backend (key ഇവിടെ മാത്രം സുരക്ഷിതമായി സൂക്ഷിക്കും)
```

ഈ 4 ഫയലുകളും **അതേ ഫോൾഡർ ഘടനയിൽ തന്നെ** Vercel-ലേക്ക് അപ്‌ലോഡ് ചെയ്യണം — `api` ഫോൾഡർ അതേപടി വേണം, അല്ലെങ്കിൽ Vercel അത് serverless function ആയി തിരിച്ചറിയില്ല.

## Gemini API Key എടുക്കുന്ന വിധം
1. https://aistudio.google.com/app/apikey എന്നതിൽ പോകുക
2. Google അക്കൗണ്ട് ഉപയോഗിച്ച് login ചെയ്യുക
3. "Create API key" ക്ലിക്ക് ചെയ്യുക
4. കിട്ടുന്ന key കോപ്പി ചെയ്യുക (ഇത് ആരോടും share ചെയ്യരുത്)

## Vercel-ൽ Deploy ചെയ്യുന്ന വിധം

**ആദ്യമായി deploy ചെയ്യുകയാണെങ്കിൽ:**
1. ഈ ഫോൾഡർ മുഴുവൻ ഒരു GitHub repo ആയി push ചെയ്യുക, അല്ലെങ്കിൽ Vercel CLI ഉപയോഗിച്ച് `vercel` കമാൻഡ് റൺ ചെയ്യുക
2. Vercel dashboard-ൽ പ്രോജക്റ്റ് തുറക്കുക → **Settings → Environment Variables**
3. പുതിയ variable ചേർക്കുക:
   - Name: `GEMINI_API_KEY`
   - Value: (നിങ്ങൾ കോപ്പി ചെയ്ത key)
4. **Save** ചെയ്ത ശേഷം **Redeploy** ചെയ്യുക (env variable ചേർത്തതിന് ശേഷം redeploy ചെയ്തില്ലെങ്കിൽ പുതിയ key effect ആകില്ല)

**നിലവിലുള്ള പ്രോജക്റ്റ് അപ്ഡേറ്റ് ചെയ്യുകയാണെങ്കിൽ:**
1. ഈ 4 ഫയലുകളും പഴയ പ്രോജക്റ്റിലെ അതേ സ്ഥാനത്ത് replace ചെയ്യുക
2. Environment Variables-ൽ `GEMINI_API_KEY` ഇല്ലെങ്കിൽ മുകളിൽ പറഞ്ഞ പോലെ ചേർക്കുക
3. Redeploy ചെയ്യുക

## എങ്ങനെ ഇത് സുരക്ഷിതമാണ്
- `api/ai.js` **സെർവറിൽ** മാത്രമേ ഓടൂ — ബ്രൗസറിൽ ഒരിക്കലും ഇറങ്ങില്ല
- `GEMINI_API_KEY` ബ്രൗസറിന് കാണാൻ പറ്റാത്ത ഒരു സെർവർ environment variable ആണ്
- ബ്രൗസർ `/api/ai` എന്ന സ്വന്തം സെർവറിലെ വഴി മാത്രമേ വിളിക്കുന്നുള്ളൂ — key ഒരിക്കലും network tab-ലോ page source-ലോ കാണില്ല

## Key ഇല്ലാതെ test ചെയ്യണമെങ്കിൽ
`GEMINI_API_KEY` സെറ്റ് ചെയ്തിട്ടില്ലെങ്കിലും ബാക്കി 9 ടൂളുകളും (calculator, QR, compressor, etc.) സാധാരണ പോലെ work ചെയ്യും. AI ഫീച്ചറുകൾ ("Smart-format with AI", "Find & fix mistakes") മാത്രമേ key ആവശ്യപ്പെടുന്നുള്ളൂ — അവ ക്ലിക്ക് ചെയ്താൽ വ്യക്തമായ error message കാണിക്കും, page break ആകില്ല.

## ഇത്തവണ ശരിയാക്കിയത് (ഏറ്റവും പുതിയ അപ്ഡേറ്റ്)

**റീ-അപ്‌ലോഡ് ചെയ്യേണ്ട ഫയലുകൾ: `index.html`, `app.js`, `api/ai.js` — ഈ 3 എണ്ണം മാത്രം. `vercel.json` മാറ്റിയിട്ടില്ല.**

GitHub-ൽ ഓരോ ഫയലും തുറന്ന് pencil (✏️) icon ക്ലിക്ക് ചെയ്ത് പഴയ ഉള്ളടക്കം മുഴുവൻ ഡിലീറ്റ് ചെയ്ത് പുതിയത് paste ചെയ്ത് **Commit changes** ചെയ്യുക. 3 ഫയലും commit ചെയ്ത ശേഷം Vercel സ്വയം redeploy ചെയ്യും.

- **AI ഫീച്ചർ പണിയെടുക്കാത്ത പ്രശ്നം പരിഹരിച്ചു**: യഥാർത്ഥ കാരണം — Google `gemini-1.5-flash` മോഡൽ പൂർണ്ണമായി shut down ചെയ്തിരുന്നു (എല്ലാ Gemini 1.5 മോഡലുകളും ഇപ്പോൾ 404 തരും). ഇപ്പോൾ `gemini-flash-latest` എന്ന auto-update ആകുന്ന alias ഉപയോഗിക്കുന്നു — ഇത് ഭാവിയിൽ വീണ്ടും dead ആകില്ല. കൂടാതെ, AI പിഴച്ചാൽ ഇപ്പോൾ കൃത്യമായ കാരണം (invalid key / rate limit / model not found) കാണിക്കും.
- **Photo Compressor-ൽ size/dimension ഓപ്ഷൻ ചേർത്തു**: Passport photo (2×2in, 35×45mm), Stamp size (20×25mm), A4 page presets, അല്ലെങ്കിൽ custom pixel width/height (aspect ratio lock ഓപ്ഷനോടെ) — target KB-ക്കൊപ്പം.
- **"Doc file open ആകുന്നില്ല" പ്രശ്നം യഥാർത്ഥത്തിൽ പരിഹരിച്ചു**: മുമ്പത്തെ കോഡ് HTML-നെ `.doc` എന്ന് പേരിട്ട് വിളിക്കുക മാത്രമേ ചെയ്തിരുന്നുള്ളൂ — ഇത് മിക്ക മൊബൈൽ Office ആപ്പുകളും Google Docs ഉം refuse ചെയ്യും. ഇപ്പോൾ **യഥാർത്ഥ `.docx`** ഫയൽ ഉണ്ടാക്കുന്നു (real OOXML format), ഇത് Word, Google Docs, WPS Office, എല്ലാ മൊബൈൽ ആപ്പുകളിലും തുറക്കും. ഇത് ഔദ്യോഗിക docx validator ഉപയോഗിച്ച് test ചെയ്ത് ഉറപ്പാക്കിയിട്ടുണ്ട് — headings, bold/italic text, bullet lists, tables എല്ലാം ശരിയായി render ആകുന്നു.

- **കളർ**: warm cream background + 5 വ്യത്യസ്ത accent colors (orange, violet, teal, amber, rose) ടൂൾ ഐക്കണുകൾക്ക് — ഇനി black & white അല്ല
- **Grammar checker**: "Find & fix mistakes" പുതിയ ബട്ടൺ — AI തെറ്റുകൾ കണ്ടെത്തി ശരിയാക്കിയ ടെക്സ്റ്റ് തരും, "Use this corrected text" ക്ലിക്ക് ചെയ്ത് നേരിട്ട് apply ചെയ്യാം
- **Document maker**: "Smart-format with AI" ബട്ടൺ — ഏത് കണ്ടന്റ് ഇട്ടാലും അതിന് അനുയോജ്യമായ structure (table, list, headings) AI ഉണ്ടാക്കും
- **Resume builder**: 3-ൽ നിന്ന് 10 templates ആയി — ഓരോന്നിനും വ്യത്യസ്ത layout, color, ഘടന
- **Download bug**: PDF library ലോഡ് ആകുന്നതിന് മുമ്പ് ബട്ടൺ ക്ലിക്ക് ചെയ്താൽ ഇപ്പോൾ വ്യക്തമായ message കാണിക്കും ("connection check ചെയ്യൂ, വീണ്ടും ശ്രമിക്കൂ") — മുമ്പ് ഒന്നും സംഭവിക്കാതെ silently fail ആകുമായിരുന്നു
