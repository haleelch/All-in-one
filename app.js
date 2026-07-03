// ============================================================
// NAVIGATION — hash-based URLs for SEO + direct linking
// Each tool gets a URL like /#photo-compressor, /#resume-builder-sec
// so users can bookmark, share, or arrive from Google search results.
// ============================================================

const TOOL_META = {
  'photo-compressor':   { title: 'Photo Compressor', desc: 'Compress and resize photos online — passport size, stamp size, custom dimensions.' },
  'doc-pdf-maker':      { title: 'Doc & PDF Maker', desc: 'Turn plain notes into a Word document or styled PDF with optional AI formatting.' },
  'image-to-pdf-sec':   { title: 'Images to PDF', desc: 'Combine multiple images into a single PDF file instantly, free.' },
  'age-calculator-sec': { title: 'Age Calculator', desc: 'Calculate your exact age in years, months, and days from your date of birth.' },
  'resume-builder-sec': { title: 'Resume Builder', desc: 'Build a professional resume PDF in minutes — free, no sign-up needed.' },
  'grammar-checker-sec':{ title: 'Grammar Checker', desc: 'Check and fix English grammar mistakes using AI — paste any text and get it corrected.' },
  'ppt-builder-sec':    { title: 'PowerPoint Generator', desc: 'Generate a complete PowerPoint presentation with AI from just a topic name.' },
};

const BASE_TITLE = 'Student Utility Hub — Free Online Tools for Students';
const BASE_DESC  = 'Free student tools: Photo Compressor, PDF Maker, Resume Builder, Grammar Checker, PowerPoint Generator. Works with Malayalam and English.';

function openSection(sectionId) {
  const meta = TOOL_META[sectionId];
  document.title = meta ? `${meta.title} | Student Utility Hub` : BASE_TITLE;
  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.content = meta ? meta.desc : BASE_DESC;

  location.hash = sectionId;
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.href = `${location.origin}/${location.pathname}#${sectionId}`;
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('pages').style.display = 'block';
  document.querySelectorAll('.tool-page').forEach(p => p.classList.remove('active'));
  const section = document.getElementById(sectionId);
  if (section) section.classList.add('active');
  window.scrollTo(0, 0);
  if (sectionId === 'resume-builder-sec') renderTemplateGrid();
  if (sectionId === 'ppt-builder-sec') initPptBuilder();
}

function goHome() {
  location.hash = '';
  document.title = BASE_TITLE;
  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.content = BASE_DESC;
  document.getElementById('pages').style.display = 'none';
  document.getElementById('home-page').style.display = 'block';
  window.scrollTo(0, 0);
}

// On load and hash change — handle direct links and back/forward nav.
function handleHash() {
  const hash = location.hash.replace('#', '').trim();
  if (hash && document.getElementById(hash)) {
    openSection(hash);
  } else {
    goHome();
  }
}
window.addEventListener('hashchange', handleHash);
window.addEventListener('load', handleHash);

// ============================================================
// DARK MODE
// ============================================================
function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  document.getElementById('dark-icon').innerText = isDark ? '●' : '◐';
  document.getElementById('dark-text').innerText = isDark ? 'Light' : 'Dark';
  try { localStorage.setItem('sh-dark-mode', isDark ? '1' : '0'); } catch (e) {}
}

(function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem('sh-dark-mode'); } catch (e) {}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = stored === '1' || (stored === null && prefersDark);
  if (useDark) {
    document.documentElement.classList.add('dark');
    document.getElementById('dark-icon').innerText = '●';
    document.getElementById('dark-text').innerText = 'Light';
  }
})();

// ============================================================
// AI BACKEND CALL — talks to our own /api/ai endpoint only.
// The Gemini key never appears in this file or in the browser.
// ============================================================
async function callAi(task, text) {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, text })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Request failed (${resp.status}).`);
  }
  if (!data.result) {
    throw new Error('No result returned.');
  }
  return data.result;
}

function setBtnLoading(btn, loadingLabel) {
  btn.dataset.originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${loadingLabel}`;
}
function clearBtnLoading(btn) {
  btn.disabled = false;
  if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
}

// ============================================================
// 2. DOC & PDF MAKER
// ============================================================
function updateLiveCounts() {
  const txt = document.getElementById('doc-text').value;
  document.getElementById('live-char-count').innerText = txt.length;
  const words = txt.trim().split(/\s+/).filter(w => w.length > 0);
  document.getElementById('live-word-count').innerText = txt.trim() ? words.length : 0;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

function showDocStatus(html) {
  const el = document.getElementById('doc-status');
  el.style.display = 'block';
  el.innerHTML = html;
}

// jsPDF and QRCode load from a CDN. On a slow or restrictive network they can
// fail to load, which used to make download buttons throw silently with no
// feedback — the page just looked broken. These guards check first and show
// a clear, actionable message instead of failing silently.
function ensurePdfLib() {
  if (window.jspdf && window.jspdf.jsPDF) return true;
  alert("The PDF engine hasn't finished loading yet (it loads from a CDN). Check your connection and wait a few seconds, then try again. If this keeps happening, your network may be blocking cdnjs.cloudflare.com.");
  return false;
}
function ensureHtml2Canvas() {
  if (typeof html2canvas !== 'undefined') return true;
  alert("The PDF rendering engine hasn't finished loading yet (it loads from a CDN). Check your connection and wait a few seconds, then try again. If this keeps happening, your network may be blocking cdnjs.cloudflare.com.");
  return false;
}
function ensureDocxLib() {
  if (typeof JSZip !== 'undefined') return true;
  alert("The Word document engine hasn't finished loading yet (it loads from a CDN). Check your connection and wait a few seconds, then try again. If this keeps happening, your network may be blocking cdnjs.cloudflare.com.");
  return false;
}

// Offline fallback formatter — works with no AI/network needed.
function beautifyTable() {
  const textInput = document.getElementById('doc-text').value;
  if (!textInput.trim()) { alert("Type or paste some text first."); return; }

  const rawLines = textInput.split('\n').filter(l => l.trim().length > 0);
  let subRows = "";
  rawLines.forEach(line => {
    let segment = line.trim();
    subRows += `<tr><td style="border:1px solid #cbd5e1;padding:10px;color:#334155;">${escapeHtml(segment)}</td></tr>`;
  });

  window.tableFormattedOutput = `
  <h1 style="font-family:Arial,sans-serif;color:#1e293b;margin-bottom:14px;font-size:18pt;font-weight:bold;">Document</h1>
  <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
  <tbody>${subRows}</tbody></table>`;
  showDocStatus('<span class="ok">Done</span> — formatted as a simple table. Download below.');
}

// AI-powered formatter — sends content to our backend, which calls Gemini.
async function aiFormatDocument() {
  const text = document.getElementById('doc-text').value;
  if (!text.trim()) { alert("Type or paste some text first."); return; }
  const btn = document.getElementById('ai-format-btn');
  setBtnLoading(btn, 'Formatting...');
  showDocStatus('Sending to AI for formatting...');

  try {
    const html = await callAi('document_format', text);
    window.tableFormattedOutput = html;
    showDocStatus('<span class="ok">Done</span> — AI formatted your content. Download below.');
  } catch (err) {
    showDocStatus(`Couldn't reach AI formatting: ${escapeHtml(err.message)}. Try "Format as table layout (offline)" instead, or download as plain text.`);
  } finally {
    clearBtnLoading(btn);
  }
}

// ---- DOWNLOAD FIX ----
// Root cause of "downloads don't work" on some mobile browsers: the old
// code called URL.revokeObjectURL(url) immediately after a.click(), in the
// same synchronous tick. On some mobile Chrome/WebView builds the download
// is handled asynchronously, so revoking the blob URL before the browser
// has actually read it silently kills the download — no error, nothing
// happens. Fix: revoke only after a short delay, giving the browser time
// to start reading the blob first.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ============================================================
// CLEAR BUTTON — resets a tool section back to its empty state.
// Each section needs its own field list since text inputs, file inputs,
// and status/output boxes all reset differently. Adding a new tool later
// just means adding one more case here.
// ============================================================
function clearTool(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  // Generic pass: clear every text/number/date input, textarea, and file
  // input inside the section. This handles the bulk of fields automatically
  // so new fields added later are cleared without extra code.
  section.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="file"], textarea').forEach(el => {
    el.value = '';
  });
  section.querySelectorAll('input[type="checkbox"]').forEach(el => {
    el.checked = el.defaultChecked;
  });
  section.querySelectorAll('select').forEach(el => {
    el.selectedIndex = 0;
  });

  // Hide any status/result/output boxes back to their initial empty state.
  section.querySelectorAll('.readout, .audit-box').forEach(el => {
    el.innerHTML = '';
    el.classList.add('is-hidden');
    el.style.display = 'none';
  });

  // Section-specific extra state that the generic pass above can't reach.
  if (sectionId === 'photo-compressor') {
    document.getElementById('custom-dim-row').style.display = 'none';
    document.getElementById('aspect-lock-row').style.display = 'none';
    document.getElementById('resize-preset').value = 'original';
    originalImgDims = null;
  }

  if (sectionId === 'doc-pdf-maker') {
    window.tableFormattedOutput = null;
    updateLiveCounts();
  }

  if (sectionId === 'grammar-checker-sec') {
    const auditBox = document.getElementById('audit-output');
    const aiBox = document.getElementById('ai-fix-output');
    delete aiBox.dataset.corrected;
    auditBox.classList.add('is-hidden');
    aiBox.classList.add('is-hidden');
  }

  if (sectionId === 'ppt-builder-sec') {
    const status = document.getElementById('ppt-status');
    status.classList.add('is-hidden');
    status.innerHTML = '';
  }

  if (sectionId === 'image-to-pdf-sec') {
    const status = document.getElementById('img-to-pdf-status');
    status.style.display = 'none';
    status.innerHTML = '';
  }

  if (sectionId === 'resume-builder-sec') {
    // Keep the selected template (clearing wording shouldn't reset style),
    // just clear typed-in details — already handled by the generic pass.
  }
}

// Converts our internal simple HTML (produced by beautifyTable / AI formatting,
// using only h1/h2/h3/p/table/tr/td/th/strong/em/ul/li) into an array of
// Word XML block elements (paragraphs and tables). Falls back to treating
// the input as plain text with newlines if no HTML structure is present.
function htmlToDocxBlocks(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks = [];

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function runsFromInline(node) {
    // Walks inline children, producing one <w:r> per text segment with bold/italic flags set.
    let runs = [];
    function walk(n, bold, italic) {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n.textContent;
        if (t) runs.push({ text: t, bold, italic });
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const tag = n.tagName.toLowerCase();
      const nb = bold || tag === 'strong' || tag === 'b';
      const ni = italic || tag === 'em' || tag === 'i';
      n.childNodes.forEach(c => walk(c, nb, ni));
    }
    node.childNodes.forEach(c => walk(c, false, false));
    if (runs.length === 0) runs.push({ text: '', bold: false, italic: false });
    return runs;
  }

  function runsToXml(runs) {
    return runs.map(r => {
      const props = (r.bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '');
      const rPr = props ? `<w:rPr>${props}</w:rPr>` : '';
      return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`;
    }).join('');
  }

  function paragraphXml(node, styleId) {
    const runs = runsFromInline(node);
    const pPr = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : '';
    return `<w:p>${pPr}${runsToXml(runs)}</w:p>`;
  }

  function tableXml(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map(r => r.children.length));
    const totalWidth = 9360; // DXA, fits US Letter with 1" margins
    const colWidth = Math.floor(totalWidth / colCount);
    const gridCols = Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('');

    const rowsXml = rows.map(row => {
      const isHeaderRow = row.parentElement && row.parentElement.tagName.toLowerCase() === 'thead';
      const cells = Array.from(row.children).map(cell => {
        const runs = runsFromInline(cell);
        const shading = isHeaderRow ? '<w:shd w:val="clear" w:fill="1A2332"/>' : '';
        const runXml = runsToXml(runs.map(r => ({ ...r, bold: r.bold || isHeaderRow })));
        return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shading}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:start w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:end w:w="120" w:type="dxa"/></w:tcMar></w:tcPr><w:p>${runXml}</w:p></w:tc>`;
      }).join('');
      return `<w:tr>${cells}</w:tr>`;
    }).join('');

    const borders = ['top', 'start', 'bottom', 'end', 'insideH', 'insideV']
      .map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`).join('');

    return `<w:tbl><w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${gridCols}</w:tblGrid>${rowsXml}</w:tbl><w:p/>`;
  }

  const topNodes = Array.from(container.childNodes).filter(n =>
    n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
  );

  if (topNodes.length === 0) {
    // Plain text fallback: one paragraph per line
    const text = container.textContent || '';
    text.split('\n').forEach(line => {
      blocks.push(`<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`);
    });
    return blocks;
  }

  topNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      blocks.push(`<w:p><w:r><w:t xml:space="preserve">${escapeXml(node.textContent)}</w:t></w:r></w:p>`);
      return;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'h1') blocks.push(paragraphXml(node, 'Heading1'));
    else if (tag === 'h2') blocks.push(paragraphXml(node, 'Heading2'));
    else if (tag === 'h3') blocks.push(paragraphXml(node, 'Heading3'));
    else if (tag === 'table') blocks.push(tableXml(node));
    else if (tag === 'ul' || tag === 'ol') {
      Array.from(node.children).forEach(li => {
        const runs = runsFromInline(li);
        blocks.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${runsToXml(runs)}</w:p>`);
      });
    } else if (tag === 'p' || tag === 'div') {
      blocks.push(paragraphXml(node, null));
    } else {
      blocks.push(paragraphXml(node, null));
    }
  });

  return blocks;
}

async function buildDocxBlob(bodyXmlBlocks) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`);

  zip.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`);

  zip.file('word/numbering.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`);

  zip.file('word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="288" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:col
