// ============================================================
// NAVIGATION
// ============================================================
window.addEventListener('popstate', () => {
  if (document.getElementById('pages').style.display === 'none') return;
  if (!history.state || !history.state.page) goHomeDirectlyWithoutHistory();
});

function openSection(sectionId) {
  history.pushState({ page: sectionId }, "");
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('pages').style.display = 'block';
  document.querySelectorAll('.tool-page').forEach(p => p.classList.remove('active'));
  document.getElementById(sectionId).classList.add('active');
  window.scrollTo(0, 0);
  if (sectionId === 'resume-builder-sec') renderTemplateGrid();
  if (sectionId === 'ppt-builder-sec') initPptBuilder();
}

function goHome() { history.back(); }

function goHomeDirectlyWithoutHistory() {
  document.getElementById('pages').style.display = 'none';
  document.getElementById('home-page').style.display = 'block';
}

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
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0B1120"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="27"/><w:color w:val="0B1120"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0B1120"/></w:rPr>
  </w:style>
</w:styles>`);

  const bodyXml = bodyXmlBlocks.join('');
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

async function downloadWord() {
  const text = document.getElementById('doc-text').value;
  if (!text.trim() && !window.tableFormattedOutput) { alert("Type something first."); return; }
  if (!ensureDocxLib()) return;

  const btn = document.querySelector('#doc-pdf-maker .btn-primary');
  const originalLabel = btn ? btn.innerText : null;
  if (btn) { btn.disabled = true; btn.innerText = 'Building .docx...'; }

  try {
    const sourceHtml = window.tableFormattedOutput || text.split('\n').map(line => `<p>${line}</p>`).join('');
    const blocks = htmlToDocxBlocks(sourceHtml);
    const blob = await buildDocxBlob(blocks);
    downloadBlob(blob, 'Document.docx');
    showDocStatus('<span class="ok">Download started</span> — Document.docx should open in Word, Google Docs, or any mobile Office app.');
  } catch (err) {
    console.error('docx build error:', err);
    showDocStatus("Couldn't build the Word document. Please try again, or use Download .pdf instead.");
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = originalLabel; }
  }
}

function downloadPdf() {
  const text = document.getElementById('doc-text').value;
  if (!text.trim() && !window.tableFormattedOutput) { alert("Type something first."); return; }
  if (!ensurePdfLib()) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const stripped = window.tableFormattedOutput
    ? window.tableFormattedOutput.replace(/<\/tr>/g, '\n').replace(/<\/td><td[^>]*>/g, '  |  ').replace(/<[^>]*>/g, '')
    : text;
  const lines = doc.splitTextToSize(stripped, 180);
  doc.text(lines, 15, 20);
  doc.save('Document.pdf');
  showDocStatus('<span class="ok">Download started</span> — check your downloads/notifications.');
}

// ============================================================
// 5. IMAGES TO PDF
// ============================================================
function convertImagesToPdf() {
  const files = Array.from(document.getElementById('img-to-pdf-input').files);
  const status = document.getElementById('img-to-pdf-status');
  if (files.length === 0) { alert("Choose at least one image first."); return; }
  if (!ensurePdfLib()) return;
  const btn = document.getElementById('img-to-pdf-btn');
  btn.disabled = true; btn.innerText = "Converting...";
  status.style.display = 'block';
  status.innerHTML = `Reading <span class="num">${files.length}</span> image(s)...`;

  const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  Promise.all(files.map(readFile))
    .then((dataUrls) => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      dataUrls.forEach((dataUrl, i) => {
        if (i > 0) doc.addPage();
        doc.addImage(dataUrl, 'JPEG', 10, 10, 190, 270);
      });
      doc.save('Images.pdf');
      status.innerHTML = `<span class="ok">Done</span> — ${dataUrls.length} page(s) saved to Images.pdf`;
    })
    .catch(() => { status.innerHTML = `Couldn't read one of the images. Try again.`; })
    .finally(() => { btn.disabled = false; btn.innerText = "Convert & download PDF"; });
}

// ============================================================
// 1. PHOTO COMPRESSOR
// ============================================================
const RESIZE_PRESETS = {
  passport_2x2in:    { w: 600,  h: 600 },
  passport_35x45mm:  { w: 413,  h: 531 },
  stamp_20x25mm:     { w: 236,  h: 295 },
  a4_300dpi:         { w: 2480, h: 3508 },
};

let originalImgDims = null; // {w, h} of the currently loaded image, for aspect-lock math

function previewOriginalImage() {
  const file = document.getElementById('photo-input').files[0];
  const out = document.getElementById('original-size');
  originalImgDims = null;
  if (!file) { out.style.display = 'none'; return; }

  out.style.display = 'block';
  out.innerHTML = `Original size: <span class="num">${(file.size / 1024).toFixed(1)} KB</span>`;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImgDims = { w: img.width, h: img.height };
      out.innerHTML += ` &nbsp;·&nbsp; <span class="num">${img.width}×${img.height}</span> px`;
      if (document.getElementById('custom-width').value === '') document.getElementById('custom-width').value = img.width;
      if (document.getElementById('custom-height').value === '') document.getElementById('custom-height').value = img.height;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function onResizePresetChange() {
  const preset = document.getElementById('resize-preset').value;
  const customRow = document.getElementById('custom-dim-row');
  const aspectRow = document.getElementById('aspect-lock-row');
  if (preset === 'custom') {
    customRow.style.display = 'grid';
    aspectRow.style.display = 'flex';
  } else {
    customRow.style.display = 'none';
    aspectRow.style.display = 'none';
  }
}

function onCustomDimInput(changed) {
  const lock = document.getElementById('aspect-lock').checked;
  if (!lock || !originalImgDims) return;
  const ratio = originalImgDims.w / originalImgDims.h;
  const widthEl = document.getElementById('custom-width');
  const heightEl = document.getElementById('custom-height');
  if (changed === 'width') {
    const w = parseFloat(widthEl.value);
    if (w > 0) heightEl.value = Math.round(w / ratio);
  } else {
    const h = parseFloat(heightEl.value);
    if (h > 0) widthEl.value = Math.round(h * ratio);
  }
}

function getTargetDimensions(naturalW, naturalH) {
  const preset = document.getElementById('resize-preset').value;
  if (preset === 'original') return { w: naturalW, h: naturalH };
  if (preset === 'custom') {
    const w = parseInt(document.getElementById('custom-width').value, 10);
    const h = parseInt(document.getElementById('custom-height').value, 10);
    if (w > 0 && h > 0) return { w, h };
    return { w: naturalW, h: naturalH };
  }
  const p = RESIZE_PRESETS[preset];
  return p ? { w: p.w, h: p.h } : { w: naturalW, h: naturalH };
}

function processAdvancedPhoto() {
  const input = document.getElementById('photo-input').files[0];
  if (!input) { alert("Choose an image first."); return; }
  const targetKb = parseFloat(document.getElementById('target-kb').value);
  const format = document.getElementById('photo-format').value;
  const btn = document.getElementById('compress-btn');
  btn.disabled = true; btn.innerText = "Compressing...";

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const { w, h } = getTargetDimensions(img.width, img.height);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      let q = 0.85;
      let dataUrl = canvas.toDataURL(format, q);
      if (targetKb && format === 'image/jpeg') {
        let min = 0.01, max = 0.98;
        for (let i = 0; i < 10; i++) {
          q = (min + max) / 2;
          dataUrl = canvas.toDataURL(format, q);
          const sizeKb = (dataUrl.split(',')[1].length * 0.75) / 1024;
          if (sizeKb > targetKb) max = q; else min = q;
        }
      }
      const a = document.createElement('a');
      a.href = dataUrl; a.download = 'optimized.' + (format === 'image/png' ? 'png' : 'jpg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      btn.disabled = false; btn.innerText = "Compress & download";
    };
    img.onerror = () => {
      alert("Couldn't read that image. Try a different file.");
      btn.disabled = false; btn.innerText = "Compress & download";
    };
    img.src = e.target.result;

  };
  reader.onerror = () => {
    alert("Couldn't read that file.");
    btn.disabled = false; btn.innerText = "Compress & download";
  };
  reader.readAsDataURL(input);
}

// ============================================================
// 8. AGE CALCULATOR
// ============================================================
function calculateAge() {
  const dobValue = document.getElementById('dob-input').value;
  const out = document.getElementById('age-result');
  if (!dobValue) { alert("Pick a date of birth first."); return; }
  const dob = new Date(dobValue);
  if (isNaN(dob)) return;
  if (dob > new Date()) { alert("That date is in the future."); return; }

  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  let days = now.getDate() - dob.getDate();
  if (days < 0) { months -= 1; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }

  out.style.display = 'block';
  out.innerHTML = `<span class="num">${years}</span> years, <span class="num">${months}</span> months, <span class="num">${days}</span> days old`;
}

// ============================================================
// 9. RESUME BUILDER — 10 distinct templates
// ============================================================
const RESUME_TEMPLATES = [
  { id: 'professional', name: 'Professional', swatch: 'linear-gradient(135deg,#100E1A,#332E4D)' },
  { id: 'creative',     name: 'Creative',     swatch: 'linear-gradient(135deg,#FF6B35,#E0A030)' },
  { id: 'minimal',      name: 'Minimal',      swatch: '#FBF8F2' },
  { id: 'modern-teal',  name: 'Modern Teal',  swatch: 'linear-gradient(135deg,#0FA3A3,#0B1120)' },
  { id: 'violet-side',  name: 'Violet Side',  swatch: 'linear-gradient(135deg,#7C5CFC,#332E4D)' },
  { id: 'classic-line', name: 'Classic Line', swatch: 'linear-gradient(180deg,#fff 60%,#100E1A 60%)' },
  { id: 'two-tone',     name: 'Two-Tone',     swatch: 'linear-gradient(90deg,#100E1A 35%,#FBF8F2 35%)' },
  { id: 'bold-header',  name: 'Bold Header',  swatch: 'linear-gradient(180deg,#E14B4B 30%,#fff 30%)' },
  { id: 'compact-grid', name: 'Compact Grid', swatch: 'repeating-linear-gradient(90deg,#E7E0D2 0 2px,#fff 2px 20px)' },
  { id: 'elegant-serif',name: 'Elegant Serif',swatch: 'linear-gradient(135deg,#332E4D,#9892AE)' },
];

let dynamicTemplate = 'professional';

function renderTemplateGrid() {
  const grid = document.getElementById('tpl-grid');
  if (grid.dataset.rendered) return;
  grid.innerHTML = RESUME_TEMPLATES.map(t => `
    <div class="tpl-card ${t.id === dynamicTemplate ? 'is-active' : ''}" data-tpl="${t.id}" onclick="setResumeTemplate('${t.id}')">
      <div class="tpl-swatch" style="background:${t.swatch};"></div>
      <span>${t.name}</span>
    </div>
  `).join('');
  grid.dataset.rendered = '1';
}

function setResumeTemplate(id) {
  dynamicTemplate = id;
  document.querySelectorAll('.tpl-card').forEach(c => {
    c.classList.toggle('is-active', c.dataset.tpl === id);
  });
}

function downloadResume() {
  if (!ensurePdfLib()) return;
  const name = document.getElementById('res-name').value || "Your Name";
  const email = document.getElementById('res-email').value || "your.email@example.com";
  const phone = document.getElementById('res-phone').value;
  const edu = document.getElementById('res-education').value || "Add your education details";
  const experience = document.getElementById('res-experience').value;
  const skills = document.getElementById('res-skills').value || "Add your skills";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = 210;
  let margin = 20;
  let y = 0;

  function section(title, body, startY, x, width, color) {
    doc.setFont(undefined, 'bold'); doc.setFontSize(11);
    if (color) doc.setTextColor(...color); else doc.setTextColor(20, 20, 20);
    doc.text(title.toUpperCase(), x, startY);
    doc.setFont(undefined, 'normal'); doc.setFontSize(10.5);
    doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(body, width);
    doc.text(lines, x, startY + 6);
    return startY + 6 + lines.length * 5.2 + 8;
  }

  const contactLine = [email, phone].filter(Boolean).join('  ·  ');

  switch (dynamicTemplate) {
    case 'professional': {
      doc.setFillColor(16, 14, 26); doc.rect(0, 0, pageWidth, 38, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont(undefined, 'bold');
      doc.text(name, 20, 20);
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(contactLine, 20, 29);
      y = 52; margin = 20;
      y = section('Education', edu, y, margin, 172);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 172);
      section('Skills', skills, y, margin, 172);
      break;
    }
    case 'creative': {
      doc.setFillColor(255, 107, 53); doc.rect(0, 0, 50, 297, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.setFont(undefined, 'bold');
      const nameLines = doc.splitTextToSize(name, 38);
      doc.text(nameLines, 8, 24);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      doc.text(doc.splitTextToSize([email, phone].filter(Boolean).join('\n'), 38), 8, 24 + nameLines.length * 7 + 6);
      margin = 65; y = 25;
      y = section('Education', edu, y, margin, 125);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 125);
      section('Skills', skills, y, margin, 125);
      break;
    }
    case 'minimal': {
      doc.setFontSize(22); doc.setFont(undefined, 'bold'); doc.setTextColor(20,20,20); doc.text(name, 20, 22);
      doc.setLineWidth(0.4); doc.line(20, 27, pageWidth - 18, 27);
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(contactLine, 20, 34);
      y = 46; margin = 20;
      y = section('Education', edu, y, margin, 172);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 172);
      section('Skills', skills, y, margin, 172);
      break;
    }
    case 'modern-teal': {
      doc.setFillColor(15, 163, 163); doc.rect(0, 0, pageWidth, 44, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont(undefined,'bold'); doc.text(name, 20, 24);
      doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.text(contactLine, 20, 34);
      y = 58; margin = 20;
      y = section('Education', edu, y, margin, 172, [15,163,163]);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 172, [15,163,163]);
      section('Skills', skills, y, margin, 172, [15,163,163]);
      break;
    }
    case 'violet-side': {
      doc.setFillColor(124, 92, 252); doc.rect(0, 0, 60, 297, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont(undefined,'bold');
      const nl = doc.splitTextToSize(name, 48); doc.text(nl, 8, 26);
      doc.setFontSize(9); doc.setFont(undefined,'normal');
      doc.text(doc.splitTextToSize([email, phone].filter(Boolean).join('\n'), 48), 8, 26 + nl.length*7 + 8);
      margin = 70; y = 28;
      y = section('Education', edu, y, margin, 120, [124,92,252]);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 120, [124,92,252]);
      section('Skills', skills, y, margin, 120, [124,92,252]);
      break;
    }
    case 'classic-line': {
      doc.setFontSize(24); doc.setFont(undefined,'bold'); doc.setTextColor(20,20,20);
      doc.text(name, pageWidth/2, 26, { align: 'center' });
      doc.setFontSize(10); doc.setFont(undefined,'normal');
      doc.text(contactLine, pageWidth/2, 34, { align: 'center' });
      doc.setLineWidth(0.6); doc.line(20, 40, pageWidth-20, 40);
      y = 52; margin = 20;
      y = section('Education', edu, y, margin, 172);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 172);
      section('Skills', skills, y, margin, 172);
      break;
    }
    case 'two-tone': {
      doc.setFillColor(16,14,26); doc.rect(0, 0, 74, 297, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont(undefined,'bold');
      const nl2 = doc.splitTextToSize(name, 60); doc.text(nl2, 8, 24);
      doc.setFontSize(9); doc.setFont(undefined,'normal');
      doc.text(doc.splitTextToSize([email, phone].filter(Boolean).join('\n'), 60), 8, 24 + nl2.length*7 + 8);
      doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.text('SKILLS', 8, 100);
      doc.setFont(undefined,'normal'); doc.setFontSize(9);
      doc.text(doc.splitTextToSize(skills, 60), 8, 107);
      margin = 84; y = 25;
      y = section('Education', edu, y, margin, 108);
      if (experience.trim()) section('Experience / Projects', experience, y, margin, 108);
      break;
    }
    case 'bold-header': {
      doc.setFillColor(225, 75, 75); doc.rect(0, 0, pageWidth, 50, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(24); doc.setFont(undefined,'bold'); doc.text(name, 20, 28);
      doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.text(contactLine, 20, 40);
      y = 64; margin = 20;
      y = section('Education', edu, y, margin, 172, [225,75,75]);
      if (experience.trim()) y = section('Experience / Projects', experience, y, margin, 172, [225,75,75]);
      section('Skills', skills, y, margin, 172, [225,75,75]);
      break;
    }
    case 'compact-grid': {
      doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.setTextColor(20,20,20); doc.text(name, 20, 20);
      doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.text(contactLine, 20, 27);
      doc.setDrawColor(231,224,210); doc.setLineWidth(0.3);
      doc.line(20, 32, pageWidth-20, 32);
      y = 42; margin = 20;
      y = section('Education', edu, y, margin, 80);
      const rightY = section('Skills', skills, 42, 110, 80);
      if (experience.trim()) section('Experience / Projects', experience, Math.max(y, rightY), margin, 172);
      break;
    }
    case 'elegant-serif':
    default: {
      doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(20,20,20); doc.text(name, 20, 24);
      doc.setFont('times', 'normal'); doc.setFontSize(11); doc.text(contactLine, 20, 32);
      doc.setLineWidth(0.3); doc.line(20, 37, pageWidth-20, 37);
      doc.setFont('times', 'bold'); doc.setFontSize(11); doc.text('EDUCATION', 20, 48);
      doc.setFont('times', 'normal'); doc.setFontSize(10.5);
      let eduLines = doc.splitTextToSize(edu, 172); doc.text(eduLines, 20, 54);
      let yy = 54 + eduLines.length*5.5 + 8;
      if (experience.trim()) {
        doc.setFont('times','bold'); doc.text('EXPERIENCE / PROJECTS', 20, yy);
        doc.setFont('times','normal');
        let expLines = doc.splitTextToSize(experience, 172); doc.text(expLines, 20, yy+6);
        yy = yy + 6 + expLines.length*5.5 + 8;
      }
      doc.setFont('times','bold'); doc.text('SKILLS', 20, yy);
      doc.setFont('times','normal'); doc.text(doc.splitTextToSize(skills, 172), 20, yy+6);
      break;
    }
  }

  doc.save('Resume.pdf');
}

// ============================================================
// 10. GRAMMAR CHECKER — offline quick check + AI fix-it
// ============================================================
function auditContent() {
  const text = document.getElementById('grammar-check-text').value;
  const out = document.getElementById('audit-output');
  document.getElementById('ai-fix-output').classList.add('is-hidden');
  out.classList.remove('is-hidden');

  if (!text.trim()) { out.innerText = "Paste some text first."; return; }

  const issues = [];
  if (/  +/.test(text)) issues.push("Double spaces found — check for accidental extra spacing.");
  const repeatMatch = text.match(/\b(\w+)\s+\1\b/i);
  if (repeatMatch) issues.push(`Repeated word found: "${repeatMatch[1]} ${repeatMatch[1]}".`);
  if (/[a-z]\.[A-Z]/.test(text)) issues.push("Missing space after a period between sentences.");
  if (/\bi\b/.test(text)) issues.push('Lowercase "i" found — the pronoun "I" should always be capitalized.');
  if (!/[.!?]\s*$/.test(text.trim())) issues.push("The text doesn't end with a period, question mark, or exclamation mark.");

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 35);
  if (longSentences.length > 0) issues.push(`${longSentences.length} sentence(s) are quite long (35+ words) — consider splitting them up.`);

  const commonTypos = { 'teh': 'the', 'recieve': 'receive', 'seperate': 'separate', 'occured': 'occurred', 'definately': 'definitely', 'alot': 'a lot' };
  Object.keys(commonTypos).forEach(typo => {
    const re = new RegExp(`\\b${typo}\\b`, 'i');
    if (re.test(text)) issues.push(`Possible typo: "${typo}" &rarr; did you mean "${commonTypos[typo]}"?`);
  });

  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const summary = `Checked ${words.length} words across ${sentences.length || 1} sentence(s).`;

  out.innerHTML = issues.length > 0
    ? `<p style="font-weight:600;margin:0 0 8px;">${summary}</p><p style="margin:0 0 6px;">Found ${issues.length} potential issue(s):</p><ul style="margin:0;padding-left:18px;">${issues.map(i => `<li>${i}</li>`).join('')}</ul>`
    : `<p style="font-weight:600;margin:0 0 8px;">${summary}</p><p style="margin:0;">No common issues detected by these checks. Still worth a careful read-through, or try "Find & fix mistakes" for a deeper AI pass.</p>`;
}

async function aiFixGrammar() {
  const text = document.getElementById('grammar-check-text').value;
  const out = document.getElementById('ai-fix-output');
  document.getElementById('audit-output').classList.add('is-hidden');
  out.classList.remove('is-hidden');

  if (!text.trim()) { out.innerText = "Paste some text first."; return; }

  const btn = document.getElementById('ai-fix-btn');
  setBtnLoading(btn, 'Checking...');
  out.innerHTML = 'Sending text to AI for review...';

  try {
    const raw = await callAi('grammar_fix', text);
    const splitIdx = raw.indexOf('CHANGES:');
    const corrected = (splitIdx >= 0 ? raw.slice(0, splitIdx) : raw).trim();
    const changes = splitIdx >= 0 ? raw.slice(splitIdx + 8).trim() : '';

    out.innerHTML = `
      <p style="font-weight:600;margin:0 0 8px;">Corrected text:</p>
      <p style="white-space:pre-wrap;background:var(--paper-deep);border-radius:8px;padding:10px;margin:0 0 10px;">${escapeHtml(corrected)}</p>
      <button class="btn btn-ghost" style="width:auto;display:inline-flex;padding:8px 14px;font-size:12px;margin-bottom:10px;" onclick="applyAiFix()">Use this corrected text</button>
      ${changes ? `<p style="font-weight:600;margin:10px 0 6px;">What was changed:</p><p style="white-space:pre-wrap;">${escapeHtml(changes)}</p>` : ''}
    `;
    out.dataset.corrected = corrected;
  } catch (err) {
    out.innerHTML = `Couldn't reach the AI service: ${escapeHtml(err.message)}. You can still try the offline quick check.`;
  } finally {
    clearBtnLoading(btn);
  }
}

function applyAiFix() {
  const out = document.getElementById('ai-fix-output');
  if (out.dataset.corrected) {
    document.getElementById('grammar-check-text').value = out.dataset.corrected;
  }
}

// ============================================================
// 11. POWERPOINT GENERATOR — offline outline -> .pptx
// Builds a real OOXML PowerPoint package by hand using JSZip
// (same approach as the Word builder above). No AI, no network.
// ============================================================

// Five color themes. Hex values are 6-char RRGGBB (no '#'), as required
// inside <a:srgbClr val="...">.
const PPT_THEMES = [
  { id: 'midnight', name: 'Midnight',     bg: '100E1A', accent: 'FF6B35', text: 'FFFFFF', sub: 'C9C4DA', swatch: 'linear-gradient(135deg,#100E1A,#332E4D)' },
  { id: 'sunrise',  name: 'Sunrise',      bg: 'FBF8F2', accent: 'FF6B35', text: '100E1A', sub: '6E6884', swatch: 'linear-gradient(135deg,#FBF8F2,#FFE4D6)' },
  { id: 'teal-deep',name: 'Teal Deep',    bg: '0B1120', accent: '0FA3A3', text: 'FFFFFF', sub: 'B7D9D9', swatch: 'linear-gradient(135deg,#0FA3A3,#0B1120)' },
  { id: 'violet',   name: 'Violet',       bg: '1B1830', accent: '7C5CFC', text: 'FFFFFF', sub: 'C9C4DA', swatch: 'linear-gradient(135deg,#7C5CFC,#1B1830)' },
  { id: 'classic',  name: 'Classic White',bg: 'FFFFFF', accent: 'E14B4B', text: '1A1A1A', sub: '595959', swatch: 'linear-gradient(180deg,#fff 60%,#E14B4B 60%)' },
];

let pptTheme = 'midnight';
let pptGridRendered = false;

function initPptBuilder() {
  renderPptThemeGrid();
  const outline = document.getElementById('ppt-outline');
  if (!outline.dataset.bound) {
    outline.addEventListener('input', updatePptSlideCount);
    outline.dataset.bound = '1';
  }
  updatePptSlideCount();
}

function renderPptThemeGrid() {
  const grid = document.getElementById('ppt-tpl-grid');
  if (pptGridRendered) return;
  grid.innerHTML = PPT_THEMES.map(t => `
    <div class="tpl-card ${t.id === pptTheme ? 'is-active' : ''}" data-tpl="${t.id}" onclick="setPptTheme('${t.id}')">
      <div class="tpl-swatch" style="background:${t.swatch};"></div>
      <span>${t.name}</span>
    </div>
  `).join('');
  grid.querySelectorAll = grid.querySelectorAll; // no-op, keeps structure consistent
  pptGridRendered = true;
}

function setPptTheme(id) {
  pptTheme = id;
  document.querySelectorAll('#ppt-tpl-grid .tpl-card').forEach(c => {
    c.classList.toggle('is-active', c.dataset.tpl === id);
  });
}

// Splits the outline textarea into slides. Blank lines separate slides;
// within a block, the first line is the slide title and the rest become
// bullet points.
function parsePptOutline(raw) {
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const title = (lines[0] || 'Untitled slide').replace(/:$/, '');
    const bullets = lines.slice(1);
    return { title, bullets };
  });
}

function updatePptSlideCount() {
  const raw = document.getElementById('ppt-outline').value;
  const slides = parsePptOutline(raw);
  const el = document.getElementById('ppt-slide-count');
  el.innerText = `${slides.length} slide(s) will be generated (plus a title slide).`;
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Builds a single <p:sp> text box XML fragment.
function pptTextBox(opts) {
  const { x, y, cx, cy, text, sizePt, bold, color, align, bullets } = opts;
  const alignAttr = align ? ` algn="${align}"` : '';
  let paragraphs;
  if (bullets && bullets.length) {
    paragraphs = bullets.map(line => `
      <a:p>
        <a:pPr marL="285750" indent="-285750"${alignAttr}>
          <a:buFont typeface="Arial"/>
          <a:buChar char="&#8226;"/>
        </a:pPr>
        <a:r>
          <a:rPr lang="en-US" sz="${sizePt * 100}" dirty="0">
            <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
          </a:rPr>
          <a:t>${xmlEscape(line)}</a:t>
        </a:r>
      </a:p>`).join('');
  } else {
    paragraphs = `
      <a:p>
        <a:pPr${alignAttr}/>
        <a:r>
          <a:rPr lang="en-US" sz="${sizePt * 100}" ${bold ? 'b="1"' : ''} dirty="0">
            <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
          </a:rPr>
          <a:t>${xmlEscape(text)}</a:t>
        </a:r>
      </a:p>`;
  }
  return `
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="0" name="TextBox"/>
        <p:cNvSpPr txBox="1"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" anchor="t"><a:noAutofit/></a:bodyPr>
        <a:lstStyle/>
        ${paragraphs}
      </p:txBody>
    </p:sp>`;
}

// Full-bleed background rectangle in the theme color.
function pptBackgroundRect(bg, EMU_W, EMU_H) {
  return `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="0" name="Background"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU_W}" cy="${EMU_H}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${bg}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;
}

// Thin accent bar used on title + content slides for visual identity.
function pptAccentBar(accent, x, y, cx, cy) {
  return `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="0" name="AccentBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${accent}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;
}

function buildTitleSlideXml(theme, title, subtitle, EMU_W, EMU_H) {
  const shapes = [
    pptBackgroundRect(theme.bg, EMU_W, EMU_H),
    pptAccentBar(theme.accent, 838200, 2667000, 1219200, 45720),
    pptTextBox({ x: 838200, y: 2743200, cx: 10515600, cy: 1219200, text: title, sizePt: 40, bold: true, color: theme.text }),
  ];
  if (subtitle && subtitle.trim()) {
    shapes.push(pptTextBox({ x: 838200, y: 3962400, cx: 10515600, cy: 609600, text: subtitle, sizePt: 18, bold: false, color: theme.sub }));
  }
  return shapes.join('');
}

function buildContentSlideXml(theme, slide, EMU_W, EMU_H) {
  const shapes = [
    pptBackgroundRect(theme.bg, EMU_W, EMU_H),
    pptAccentBar(theme.accent, 838200, 838200, 914400, 45720),
    pptTextBox({ x: 838200, y: 990600, cx: 10515600, cy: 762000, text: slide.title, sizePt: 28, bold: true, color: theme.text }),
  ];
  if (slide.bullets.length) {
    shapes.push(pptTextBox({
      x: 838200, y: 1981200, cx: 10515600, cy: 4267200,
      bullets: slide.bullets, sizePt: 18, color: theme.text,
    }));
  }
  return shapes.join('');
}

function pptSlideXmlWrapper(innerShapes) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${innerShapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

async function buildPptxBlob(title, subtitle, slides, themeId) {
  const theme = PPT_THEMES.find(t => t.id === themeId) || PPT_THEMES[0];
  const EMU_W = 12192000; // 16:9, 13.333in
  const EMU_H = 6858000;  // 7.5in
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n  ')}
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const slideRelEntries = slides.map((_, i) =>
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('\n  ');

  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRelEntries}
  <Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`);

  const sldIdLst = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');

  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIdLst}</p:sldIdLst>
  <p:sldSz cx="${EMU_W}" cy="${EMU_H}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

  zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="StudentHubTheme">
  <a:themeElements>
    <a:clrScheme name="StudentHub">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="${theme.bg}"/></a:dk2>
      <a:lt2><a:srgbClr val="${theme.text}"/></a:lt2>
      <a:accent1><a:srgbClr val="${theme.accent}"/></a:accent1>
      <a:accent2><a:srgbClr val="${theme.accent}"/></a:accent2>
      <a:accent3><a:srgbClr val="${theme.accent}"/></a:accent3>
      <a:accent4><a:srgbClr val="${theme.accent}"/></a:accent4>
      <a:accent5><a:srgbClr val="${theme.accent}"/></a:accent5>
      <a:accent6><a:srgbClr val="${theme.accent}"/></a:accent6>
      <a:hlink><a:srgbClr val="${theme.accent}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${theme.accent}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="StudentHub">
      <a:majorFont><a:latin typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="StudentHub">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>
        <a:ln w="12700"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>
        <a:ln w="19050"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`);

  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);

  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);

  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);

  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

  slides.forEach((slide, i) => {
    const innerShapes = i === 0
      ? buildTitleSlideXml(theme, title, subtitle, EMU_W, EMU_H)
      : buildContentSlideXml(theme, slide, EMU_W, EMU_H);
    zip.file(`ppt/slides/slide${i + 1}.xml`, pptSlideXmlWrapper(innerShapes));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
  });

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

async function downloadPpt() {
  const title = document.getElementById('ppt-title').value.trim() || 'Untitled Presentation';
  const subtitle = document.getElementById('ppt-subtitle').value.trim();
  const outlineRaw = document.getElementById('ppt-outline').value;
  const contentSlides = parsePptOutline(outlineRaw);

  if (!contentSlides.length) {
    alert("Add at least one slide to your outline first (a title line, optionally followed by bullet points).");
    return;
  }
  if (!ensureDocxLib()) return; // JSZip guard — same lib powers both .docx and .pptx

  const btn = document.getElementById('ppt-download-btn');
  setBtnLoading(btn, 'Building .pptx...');

  try {
    // Slide 1 is always the title slide; the rest come from the outline.
    const allSlides = [{ title, bullets: [] }, ...contentSlides];
    const blob = await buildPptxBlob(title, subtitle, allSlides, pptTheme);
    const safeName = title.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '_') || 'Presentation';
    downloadBlob(blob, `${safeName}.pptx`);
  } catch (err) {
    console.error('pptx build error:', err);
    alert("Couldn't build the PowerPoint file. Please try again — if it keeps happening, try simplifying the outline.");
  } finally {
    clearBtnLoading(btn);
  }
}
