/* MDocify 핵심: Markdown -> .docx (Blob) — 미리보기(.content)와 동일한 룩으로 생성.
 * 표지(frontmatter) + 제목 색/좌측바/섹션배지 + 다크 코드블록(구문 색) + 브랜드 표머리 + 인용.
 * 노출: window.MD2DOCX.convert(mdText, tpl) -> Promise<Blob>
 */
(function () {
  'use strict';
  function D() { return window.docx; }

  /* ---------- 자산 사전 해석 (async) ---------- */
  function svgToPng(svg, maxW) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        var nw = img.naturalWidth || 400, nh = img.naturalHeight || 300, scale = 2;
        var c = document.createElement('canvas'); c.width = Math.round(nw * scale); c.height = Math.round(nh * scale);
        var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (!b) { reject(new Error('toBlob 실패')); return; } b.arrayBuffer().then(function (ab) { var w = nw, h = nh; if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; } resolve({ data: new Uint8Array(ab), w: w, h: h }); }); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('SVG 로드 실패')); };
      img.src = url;
    });
  }
  function fetchImage(src, maxW) {
    return new Promise(function (resolve) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var nw = img.naturalWidth || 400, nh = img.naturalHeight || 300;
          var c = document.createElement('canvas'); c.width = nw; c.height = nh; c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob(function (b) { if (!b) { resolve(null); return; } b.arrayBuffer().then(function (ab) { var w = nw, h = nh; if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; } resolve({ data: new Uint8Array(ab), w: w, h: h }); }); }, 'image/png');
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  /* 이미지 크기 단축 문법: href 끝의 " =300x200"·"=300x"·"=x200"·"=50%"·"=300" 파싱(공백 또는 %20 구분). */
  function parseImgSize(href) { var m = /^(.*\S)(?:\s+|%20)=\s*(\d+x\d+|\d+x|x\d+|\d+%|\d+)\s*$/i.exec(href || ''); return m ? { href: m[1].trim(), spec: m[2].toLowerCase() } : null; }
  /* 자연 크기(콘텐츠폭 상한 적용본) r 에 지정 크기를 반영. 한 축만 주면 비율 유지. 페이지 폭 초과는 축소. */
  function applyImgSize(r, spec, tpl) {
    var maxW = tpl.contentWidthPx || 600, w = r.w, h = r.h, m;
    if (m = /^(\d+)x(\d+)$/.exec(spec)) { w = +m[1]; h = +m[2]; }
    else if (m = /^(\d+)x$/.exec(spec)) { var nw = +m[1]; h = Math.round(h * (nw / w)); w = nw; }
    else if (m = /^x(\d+)$/.exec(spec)) { var nh = +m[1]; w = Math.round(w * (nh / h)); h = nh; }
    else if (m = /^(\d+)%$/.exec(spec)) { var pw = Math.round(maxW * (+m[1]) / 100); h = Math.round(h * (pw / w)); w = pw; }
    else { var sw = +spec; h = Math.round(h * (sw / w)); w = sw; }
    if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
    r.w = Math.max(1, w); r.h = Math.max(1, h);
  }
  function resolveAssets(tokens, tpl) {
    var jobs = [];
    function walk(toks) {
      if (!toks) return;
      toks.forEach(function (t) {
        if (t.type === 'code' && isMermaid(t)) jobs.push(renderDiagram(t, tpl));
        if (t.type === 'image') { var _sz = parseImgSize(t.href); var _hf = _sz ? _sz.href : t.href; jobs.push(fetchImage(_hf, tpl.contentWidthPx).then(function (r) { if (r && _sz) applyImgSize(r, _sz.spec, tpl); t._img = r; })); }
        if (t.tokens) walk(t.tokens);
        if (t.items) walk(t.items);
        if (t.rows) t.rows.forEach(function (row) { row.forEach(function (cell) { walk(cell.tokens); }); });
        if (t.header) t.header.forEach(function (cell) { walk(cell.tokens); });
      });
    }
    walk(tokens);
    return Promise.all(jobs);
  }
  function isMermaid(t) { var lang = (t.lang || '').trim().toLowerCase(); if (lang === 'mermaid') return true; return !!(window.DIAG && lang === '' && window.DIAG.detectKind(t.text || '')); }
  function renderDiagram(t, tpl) {
    return Promise.resolve().then(function () {
      if (!window.DIAG) return;
      var kind = window.DIAG.detectKind(t.text || '');
      if (!kind) { t._diagUnsupported = true; return; }
      var svg = window.DIAG.render(kind, t.text || '');
      return svgToPng(svg, tpl.contentWidthPx).then(function (png) { t._png = png; }).catch(function () { t._diagFailed = true; });
    });
  }

  /* ---------- frontmatter / 표지 ---------- */
  function esc(s){return s==null?'':String(s);}
  function parseFrontmatter(t) {
    var m = t.match(/^---\s*\n([\s\S]*?)\n---\s*\n/), meta = {}; if (!m) return { meta: meta, body: t };
    m[1].split("\n").forEach(function (line) { var i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ""); });
    return { meta: meta, body: t.slice(m[0].length) };
  }
  function buildCoverChildren(meta, tpl) {
    var Dx = D(), C = Dx.AlignmentType.CENTER;
    var kicker = meta['사업명'] || meta.kicker || '', title = meta.title || meta['제목'] || '', subtitle = meta.subtitle || meta['부제'] || '';
    var special = { title: 1, subtitle: 1, '제목': 1, '부제': 1, '사업명': 1, kicker: 1 };
    var keys = Object.keys(meta).filter(function (k) { return !special[k]; });
    if (!title && !subtitle && !keys.length) return [];
    var out = [];
    out.push(new Dx.Paragraph({ spacing: { before: 2800 }, children: [] }));
    if (kicker) out.push(new Dx.Paragraph({ alignment: C, spacing: { after: 140 }, children: [new Dx.TextRun({ text: esc(kicker), bold: true, color: tpl.cover.kickerColor, size: 22, font: tpl.font })] }));
    if (title) out.push(new Dx.Paragraph({ alignment: C, spacing: { after: 90 }, children: [new Dx.TextRun({ text: esc(title), bold: true, color: tpl.cover.titleColor, size: tpl.cover.titleSize, font: tpl.font })] }));
    if (subtitle) out.push(new Dx.Paragraph({ alignment: C, spacing: { after: 260 }, children: [new Dx.TextRun({ text: esc(subtitle), color: tpl.cover.subColor, size: 24, font: tpl.font })] }));
    if (keys.length) {
      var none = { top: { style: Dx.BorderStyle.NONE }, bottom: { style: Dx.BorderStyle.NONE }, left: { style: Dx.BorderStyle.NONE }, right: { style: Dx.BorderStyle.NONE } };
      var rows = keys.map(function (k) {
        return new Dx.TableRow({ children: [
          new Dx.TableCell({ borders: none, margins: { top: 30, bottom: 30, left: 140, right: 140 }, children: [new Dx.Paragraph({ alignment: Dx.AlignmentType.RIGHT, children: [new Dx.TextRun({ text: esc(k), color: tpl.cover.metaKColor, size: 20, font: tpl.font })] })] }),
          new Dx.TableCell({ borders: none, margins: { top: 30, bottom: 30, left: 140, right: 140 }, children: [new Dx.Paragraph({ children: [new Dx.TextRun({ text: esc(meta[k]), color: tpl.bodyColor, size: 20, font: tpl.font })] })] })
        ] });
      });
      out.push(new Dx.Table({ alignment: C, width: { size: 62, type: Dx.WidthType.PERCENTAGE }, borders: { top: { style: Dx.BorderStyle.NONE }, bottom: { style: Dx.BorderStyle.NONE }, left: { style: Dx.BorderStyle.NONE }, right: { style: Dx.BorderStyle.NONE }, insideHorizontal: { style: Dx.BorderStyle.NONE }, insideVertical: { style: Dx.BorderStyle.NONE } }, rows: rows }));
    }
    return out;
  }

  /* ---------- 코드 구문 토크나이저 (세그먼트, hlCode 이식) ---------- */
  function hlCodeSeg(src, lang) {
    var segs = [];
    function push(c, t) { if (t) segs.push({ c: c, t: t }); }
    function scan(str, RE, map) { var last = 0, m; while ((m = RE.exec(str)) !== null) { if (m.index === RE.lastIndex) { RE.lastIndex++; continue; } push(null, str.slice(last, m.index)); push(map(m), m[0]); last = RE.lastIndex; } push(null, str.slice(last)); }
    lang = (lang || "").toLowerCase().trim();
    var AL = { javascript: "js", jsx: "js", mjs: "js", node: "js", typescript: "ts", tsx: "ts", "c++": "cpp", cxx: "cpp", cc: "cpp", hpp: "cpp", "c#": "cs", csharp: "cs", py: "python", python3: "python", sh: "bash", shell: "bash", zsh: "bash", ps: "powershell", ps1: "powershell", pwsh: "powershell", xml: "html", htm: "html", markdown: "md", mkd: "md" };
    var L = AL[lang] || lang;
    if (L === "html") { scan(src, /(<!--[\s\S]*?-->)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(<\/?[a-zA-Z][\w:-]*|\/?>)|([a-zA-Z_:][\w:.-]*)(?=\s*=)/g, function (m) { return m[1] !== undefined ? "com" : m[2] !== undefined ? "str" : m[3] !== undefined ? "kw" : "fn"; }); return segs; }
    if (L === "css" || L === "scss") { var cRE = L === "scss" ? "\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*" : "\\/\\*[\\s\\S]*?\\*\\/"; var RE = new RegExp("(" + cRE + ")|(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')|(#[0-9a-fA-F]{3,8}\\b|\\b\\d[\\d.]*(?:px|em|rem|%|vh|vw|vmin|vmax|pt|s|ms|deg|fr|ch|ex)?\\b)|(@[\\w-]+|\\$[\\w-]+|--[\\w-]+|![a-z]+)|([a-zA-Z-][\\w-]*)(?=\\s*:)", "g"); scan(src, RE, function (m) { return m[1] !== undefined ? "com" : m[2] !== undefined ? "str" : m[3] !== undefined ? "num" : m[4] !== undefined ? "kw" : "fn"; }); return segs; }
    if (L === "md") {
      var inlRE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]]+\]\([^)]+\))/g;
      var inlMap = function (m) { return m[1] !== undefined ? "str" : m[2] !== undefined ? "kw" : m[3] !== undefined ? "lit" : "fn"; };
      var lines = src.split("\n");
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) push(null, "\n");
        var ln = lines[i];
        if (/^\s{0,3}#{1,6}\s/.test(ln)) push("kw", ln);
        else if (/^\s{0,3}>/.test(ln)) push("com", ln);
        else if (/^\s{0,3}(```|~~~)/.test(ln)) push("kw", ln);
        else { var mm = ln.match(/^(\s{0,3})([-*+]|\d+\.)(\s.*)$/); if (mm) { push(null, mm[1]); push("kw", mm[2]); scan(mm[3], inlRE, inlMap); } else scan(ln, inlRE, inlMap); }
      }
      return segs;
    }
    var K = { js: "abstract async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch this throw try typeof var void while with yield", ts: "abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface keyof let namespace new of private protected public readonly return set static super switch this throw try type typeof var void while yield", c: "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define ifdef ifndef endif pragma undef", cpp: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern float for friend goto if inline int long namespace new nullptr operator override private protected public register return short signed sizeof static struct switch template this throw try typedef typename union unsigned using virtual void volatile while include define", cs: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach get goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed set short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await yield", php: "abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty endif extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield", python: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case", bash: "if then else elif fi case esac for while until do done in function select time echo cd export local return read source alias unset shift eval exec set", powershell: "if elseif else switch foreach for while do until break continue function return param begin process end try catch finally throw class enum filter in trap exit", sql: "select from where insert into values update set delete create table drop alter add column index view join inner left right outer full on group by order having limit offset union all as distinct and or not null is in like between exists case when then else end primary key foreign references default constraint unique", json: "" };
    var LN = { js: ["//"], ts: ["//"], c: ["//"], cpp: ["//"], cs: ["//"], php: ["//", "#"], python: ["#"], bash: ["#"], powershell: ["#"], sql: ["--"], json: [] };
    var BL = { js: 1, ts: 1, c: 1, cpp: 1, cs: 1, php: 1, sql: 1 }, TPL = { js: 1, ts: 1 }, TRIPLE = { python: 1 };
    if (!(L in K)) L = "js";
    function q(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    var g = [], com = []; if (BL[L]) com.push("\\/\\*[\\s\\S]*?\\*\\/"); if (L === "powershell") com.push("<#[\\s\\S]*?#>"); (LN[L] || []).forEach(function (x) { com.push(q(x) + "[^\\n]*"); }); g.push(com.length ? com.join("|") : "(?!)");
    var st = []; if (TRIPLE[L]) { st.push('"""[\\s\\S]*?"""', "'''[\\s\\S]*?'''"); } st.push('"(?:\\\\.|[^"\\\\])*"', "'(?:\\\\.|[^'\\\\])*'"); if (TPL[L]) st.push("`(?:\\\\.|[^`\\\\])*`"); g.push(st.join("|"));
    g.push("0[xX][\\da-fA-F]+|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b");
    var kw = (K[L] || "").trim(); g.push(kw ? "\\b(?:" + kw.split(/\s+/).map(q).join("|") + ")\\b" : "(?!)");
    g.push("\\b(?:true|false|null|undefined|None|True|False|nil|NaN|NULL)\\b");
    g.push("[A-Za-z_$][\\w$]*(?=\\s*\\()");
    var RE2 = new RegExp(g.map(function (x) { return "(" + x + ")"; }).join("|"), "g" + (L === "sql" ? "i" : ""));
    scan(src, RE2, function (m) { return m[1] !== undefined ? "com" : m[2] !== undefined ? "str" : m[3] !== undefined ? "num" : m[4] !== undefined ? "kw" : m[5] !== undefined ? "lit" : "fn"; });
    return segs;
  }

  /* ---------- 인라인 -> runs ---------- */
  function inlineRuns(tokens, tpl, sty) {
    sty = sty || {}; var out = [];
    (tokens || []).forEach(function (t) {
      switch (t.type) {
        case 'text': if (t.tokens && t.tokens.length) out = out.concat(inlineRuns(t.tokens, tpl, sty)); else out.push(runText(decode(t.text), tpl, sty)); break;
        case 'escape': out.push(runText(t.text, tpl, sty)); break;
        case 'strong': out = out.concat(inlineRuns(t.tokens, tpl, merge(sty, { bold: true }))); break;
        case 'em': out = out.concat(inlineRuns(t.tokens, tpl, merge(sty, { italics: true }))); break;
        case 'del': out = out.concat(inlineRuns(t.tokens, tpl, merge(sty, { strike: true, color: tpl.del.color }))); break;
        case 'codespan': out.push(runCode(t.text, tpl, sty)); break;
        case 'br': out.push(new (D().TextRun)({ break: 1 })); break;
        case 'link': { var kids = inlineRuns(t.tokens, tpl, merge(sty, { color: tpl.link.color, underline: {} })); if (!kids.length) kids = [runText(t.href, tpl, merge(sty, { color: tpl.link.color, underline: {} }))]; out.push(new (D().ExternalHyperlink)({ children: kids, link: t.href })); break; }
        case 'image': if (t._img) out.push(imageRun(t._img)); else out.push(runText('[' + (t.text || 'image') + ']', tpl, merge(sty, { italics: true, color: tpl.del.color }))); break;
        case 'html': { var s = (t.text || '').replace(/<[^>]+>/g, ''); if (s) out.push(runText(s, tpl, sty)); break; }
        default: if (t.tokens) out = out.concat(inlineRuns(t.tokens, tpl, sty)); else if (t.text != null) out.push(runText(decode(t.text), tpl, sty));
      }
    });
    return out;
  }
  function runText(text, tpl, sty) { text = (text == null ? '' : String(text)).replace(/[\r\n]+/g, ' '); return new (D().TextRun)(Object.assign({ text: text, font: sty.font || tpl.font, size: sty.size || tpl.bodySize, color: sty.color || tpl.bodyColor }, styFlags(sty))); }
  function runCode(text, tpl, sty) { return new (D().TextRun)(Object.assign({ text: text, font: tpl.codeFont, size: sty.size || tpl.bodySize, color: tpl.inlineCode.color, shading: { type: D().ShadingType.CLEAR, fill: tpl.inlineCode.fill } }, styFlags(sty))); }
  function imageRun(img) { return new (D().ImageRun)({ data: img.data, type: 'png', transformation: { width: img.w, height: img.h } }); }
  function styFlags(sty) { var o = {}; if (sty.bold) o.bold = true; if (sty.italics) o.italics = true; if (sty.strike) o.strike = true; if (sty.underline) o.underline = sty.underline; return o; }
  function merge(a, b) { return Object.assign({}, a, b); }
  function decode(s) { if (s == null) return ''; return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' '); }

  /* ---------- 블록 ---------- */
  function blocksToChildren(tokens, tpl, ctx) {
    var out = [];
    (tokens || []).forEach(function (t) {
      switch (t.type) {
        case 'heading': out.push(heading(t, tpl)); break;
        case 'paragraph': case 'text': out.push(paragraph(t, tpl)); break;
        case 'blockquote': out = out.concat(blockquote(t, tpl, ctx)); break;
        case 'code': if (isMermaid(t) || t._png || t._diagUnsupported || t._diagFailed) out = out.concat(diagramBlock(t, tpl)); else out.push(codeBlock(t, tpl)); break;
        case 'list': out = out.concat(list(t, tpl, ctx, 0)); break;
        case 'table': out.push(table(t, tpl)); break;
        case 'hr': out.push(hr(tpl)); break;
        case 'space': break;
        case 'html': { var s = (t.text || '').replace(/<[^>]+>/g, '').trim(); if (s) out.push(new (D().Paragraph)({ children: [runText(s, tpl, {})], spacing: { after: tpl.para.after } })); break; }
        default: if (t.tokens) out.push(new (D().Paragraph)({ children: inlineRuns(t.tokens, tpl, {}), spacing: { after: tpl.para.after } }));
      }
    });
    return out;
  }

  var HLV = [null, 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'];
  function heading(t, tpl) {
    var Dx = D(), h = tpl.heading[t.depth] || tpl.heading[6];
    var toks = (t.tokens || []).slice();
    var badge = [];
    if (h.badge && toks.length && toks[0].type === 'text' && !(toks[0].tokens && toks[0].tokens.length)) {
      var m = toks[0].text.match(/^([A-Z])[.)·]?\s+([\s\S]*)$/);
      if (m) {
        badge.push(new Dx.TextRun({ text: ' ' + m[1] + ' ', bold: true, color: tpl.sn.color, size: h.size, font: tpl.font, shading: { type: Dx.ShadingType.CLEAR, fill: tpl.sn.fill } }));
        badge.push(new Dx.TextRun({ text: '  ', size: h.size, font: tpl.font }));
        toks[0] = Object.assign({}, toks[0], { text: m[2], tokens: undefined });
      }
    }
    var runs = badge.concat(inlineRuns(toks, tpl, { bold: h.bold, size: h.size, color: h.color }));
    var opts = { heading: Dx.HeadingLevel[HLV[t.depth] || 'HEADING_6'], spacing: { before: h.before, after: h.after }, children: runs };
    var border = {};
    if (h.leftBar) { border.left = { style: Dx.BorderStyle.SINGLE, size: 28, color: h.leftBar, space: 10 }; opts.indent = { left: 120 }; }
    if (h.bottomBorder) border.bottom = { style: Dx.BorderStyle.SINGLE, size: h.bottomBorderSize || 8, color: h.bottomBorderColor || 'E2E8F0', space: 4 };
    if (h.leftBar || h.bottomBorder) opts.border = border;
    return new Dx.Paragraph(opts);
  }
  function paragraph(t, tpl) { return new (D().Paragraph)({ spacing: { after: tpl.para.after, line: tpl.para.line }, children: inlineRuns(t.tokens, tpl, {}) }); }
  function blockquote(t, tpl, ctx) {
    var Dx = D(), out = [];
    (t.tokens || []).forEach(function (src) {
      if (src.type === 'paragraph' || src.type === 'text') {
        var toks = src.tokens || [{ type: 'text', text: src.text }];
        out.push(new Dx.Paragraph({ spacing: { after: tpl.para.after, line: tpl.para.line }, indent: { left: tpl.blockquote.indent }, shading: { type: Dx.ShadingType.CLEAR, fill: tpl.blockquote.fill }, border: { left: { style: Dx.BorderStyle.SINGLE, size: 24, color: tpl.blockquote.barColor, space: 10 } }, children: inlineRuns(toks, tpl, { color: tpl.blockquote.color }) }));
      } else out = out.concat(blocksToChildren([src], tpl, ctx));
    });
    return out;
  }
  function codeBlock(t, tpl) {
    var Dx = D();
    var segs = hlCodeSeg(String(t.text || '').replace(/\n$/, ''), (t.lang || '').toLowerCase().trim());
    var kids = [];
    segs.forEach(function (s) {
      var parts = s.t.split('\n');
      parts.forEach(function (p, i) {
        if (i > 0) kids.push(new Dx.TextRun({ break: 1 }));
        if (p) kids.push(new Dx.TextRun({ text: p, font: tpl.codeFont, size: tpl.code.size, color: (s.c && tpl.code.syntax[s.c]) ? tpl.code.syntax[s.c] : tpl.code.color }));
      });
    });
    return new Dx.Paragraph({ shading: { type: Dx.ShadingType.CLEAR, fill: tpl.code.fill }, spacing: { before: 100, after: 160, line: 240 }, indent: { left: 120, right: 120 }, children: kids });
  }
  function diagramBlock(t, tpl) {
    var Dx = D();
    if (t._png) return [new Dx.Paragraph({ alignment: Dx.AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [imageRun(t._png)] })];
    var note = t._diagUnsupported ? '지원하지 않는 다이어그램 (지원: flowchart · sequence · erDiagram · pie · state · class · gantt · journey · mindmap · timeline)' : '다이어그램 렌더 실패';
    return [new Dx.Paragraph({ spacing: { before: 120, after: 40 }, children: [runText(note, tpl, { italics: true, color: tpl.del.color, size: 20 })] }), codeBlock(t, tpl)];
  }
  function list(t, tpl, ctx, level) {
    var Dx = D(), out = [], ordered = !!t.ordered, ref = null;
    if (ordered) { ref = 'ol' + ctx.numbering.length; var start = (typeof t.start === 'number' && t.start >= 1) ? t.start : 1; ctx.numbering.push(numberingConfig(ref, start)); }
    (t.items || []).forEach(function (item) {
      var inlineToks = [], nested = [];
      (item.tokens || []).forEach(function (it) { if (it.type === 'list') nested.push(it); else if (it.type === 'text' || it.type === 'paragraph') inlineToks = inlineToks.concat(it.tokens || [{ type: 'text', text: it.text }]); else if (it.type === 'space') {} else inlineToks = inlineToks.concat(it.tokens || []); });
      var opts = { spacing: { after: 50, line: tpl.para.line }, children: inlineRuns(inlineToks, tpl, {}) };
      if (ordered) opts.numbering = { reference: ref, level: Math.min(level, 2) }; else opts.bullet = { level: Math.min(level, 2) };
      if (item.task) { opts.bullet = undefined; opts.numbering = undefined; opts.children = [runText(item.checked ? '☑ ' : '☐ ', tpl, {})].concat(opts.children); opts.indent = { left: 360 + level * 360 }; }
      out.push(new Dx.Paragraph(opts));
      nested.forEach(function (nl) { out = out.concat(list(nl, tpl, ctx, level + 1)); });
    });
    return out;
  }
  function numberingConfig(ref, start) {
    var A = D().AlignmentType;
    return { reference: ref, levels: [
      { level: 0, format: 'decimal', text: '%1.', start: start || 1, alignment: A.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: 'lowerLetter', text: '%2.', alignment: A.START, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      { level: 2, format: 'lowerRoman', text: '%3.', alignment: A.START, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } }
    ] };
  }
  function table(t, tpl) {
    var Dx = D(), aligns = t.align || [];
    function alignOf(i) { var a = aligns[i]; return a === 'center' ? Dx.AlignmentType.CENTER : a === 'right' ? Dx.AlignmentType.RIGHT : Dx.AlignmentType.LEFT; }
    function cell(cellTok, i, header, even) {
      var runs = inlineRuns(cellTok.tokens || [{ type: 'text', text: cellTok.text }], tpl, header ? { bold: true, color: tpl.table.headerColor } : {});
      var fill = header ? tpl.table.headerFill : (even ? tpl.table.evenFill : null);
      return new Dx.TableCell({ shading: fill ? { type: Dx.ShadingType.CLEAR, fill: fill } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Dx.Paragraph({ alignment: alignOf(i), children: runs })] });
    }
    var rows = [new Dx.TableRow({ tableHeader: true, children: (t.header || []).map(function (c, i) { return cell(c, i, true, false); }) })];
    (t.rows || []).forEach(function (r, j) { rows.push(new Dx.TableRow({ children: r.map(function (c, i) { return cell(c, i, false, j % 2 === 1); }) })); });
    var bd = { style: Dx.BorderStyle.SINGLE, size: 4, color: tpl.table.border };
    return new Dx.Table({ width: { size: 100, type: Dx.WidthType.PERCENTAGE }, borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd }, rows: rows });
  }
  function hr(tpl) { return new (D().Paragraph)({ spacing: { before: 120, after: 120 }, border: { bottom: { style: D().BorderStyle.SINGLE, size: 8, color: tpl.hrColor, space: 4 } }, children: [] }); }

  /* ---------- 설정 오버라이드: 미리보기 설정(색/폰트/크기)을 .docx 템플릿에 반영 ---------- */
  function applyOverrides(tpl, ov) {
    if (!ov) return tpl;
    var t = JSON.parse(JSON.stringify(tpl));   // 순수 데이터 → 깊은 복제(원본 템플릿 불변)
    var ob = (t.brand || '').toUpperCase(), oa = (t.accent || '').toUpperCase();
    var nb = ov.brand ? ov.brand.replace('#', '').toUpperCase() : null;
    var na = ov.accent ? ov.accent.replace('#', '').toUpperCase() : null;
    if (nb || na) (function walk(o) { for (var k in o) { if (!Object.prototype.hasOwnProperty.call(o, k)) continue; var v = o[k]; if (typeof v === 'string') { var u = v.toUpperCase(); if (nb && u === ob) o[k] = nb; else if (na && u === oa) o[k] = na; } else if (v && typeof v === 'object') walk(v); } })(t);
    if (ov.sizePx && ov.sizePx > 0) {
      var f = ov.sizePx / 14, R = function (x) { return Math.max(1, Math.round(x * f)); };
      if (t.bodySize) t.bodySize = R(t.bodySize);
      if (t.heading) for (var h = 1; h <= 6; h++) { if (t.heading[h] && t.heading[h].size) t.heading[h].size = R(t.heading[h].size); }
      if (t.code && t.code.size) t.code.size = R(t.code.size);
      if (t.cover && t.cover.titleSize) t.cover.titleSize = R(t.cover.titleSize);
    }
    if (ov.font && ov.font.docx) t.font = ov.font.docx;
    return t;
  }
  /* ---------- 쪽 머리말/바닥글(Header/Footer) — 본문 섹션에만 부착 ---------- */
  /* cfg.text 를 {pageNumber}/{totalPages}/{title} 토큰으로 쪼개 TextRun 배열 생성. 페이지 번호는 docx 필드. */
  function hfRuns(text, tpl, title) {
    var Dx = D(), runs = [], re = /(\{pageNumber\}|\{totalPages\}|\{title\})/g;
    var parts = String(text == null ? '' : text).split(re);
    parts.forEach(function (seg) {
      if (seg === '') return;
      if (seg === '{pageNumber}') runs.push(new Dx.TextRun({ children: [Dx.PageNumber.CURRENT], size: 18, color: '94A3B8', font: tpl.font }));
      else if (seg === '{totalPages}') runs.push(new Dx.TextRun({ children: [Dx.PageNumber.TOTAL_PAGES], size: 18, color: '94A3B8', font: tpl.font }));
      else if (seg === '{title}') runs.push(new Dx.TextRun({ text: title || '', size: 18, color: '94A3B8', font: tpl.font }));
      else runs.push(new Dx.TextRun({ text: seg, size: 18, color: '94A3B8', font: tpl.font }));
    });
    if (!runs.length) runs.push(new Dx.TextRun({ text: '', size: 18, color: '94A3B8', font: tpl.font }));
    return runs;
  }
  function buildHF(cfg, tpl, isFooter, title) {
    var Dx = D();
    if (!cfg || !cfg.on) return null;
    var align = cfg.align === 'left' ? Dx.AlignmentType.LEFT : (cfg.align === 'right' ? Dx.AlignmentType.RIGHT : Dx.AlignmentType.CENTER);
    var opts = { alignment: align, children: hfRuns(cfg.text, tpl, title) };
    if (cfg.border) { var b = { style: Dx.BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 4 }; opts.border = isFooter ? { top: b } : { bottom: b }; }
    var para = new Dx.Paragraph(opts);
    return isFooter ? new Dx.Footer({ children: [para] }) : new Dx.Header({ children: [para] });
  }

  /* ---------- 진입점 ---------- */
  function convert(md, tpl, overrides) {
    var Dx = D();
    if (!Dx) return Promise.reject(new Error('docx 라이브러리가 로드되지 않았습니다.'));
    tpl = applyOverrides(tpl, overrides);
    var fm = parseFrontmatter(md || ''), meta = fm.meta, body = fm.body;
    var title = meta.title || meta['제목'] || '';
    if (title) body = body.replace(/^\s*#\s+(.*)\r?\n/, function (m, h) { return h.trim() === title.trim() ? '' : m; });
    var tokens = window.marked.lexer(body);
    return resolveAssets(tokens, tpl).then(function () {
      var ctx = { numbering: [] };
      var bodyChildren = blocksToChildren(tokens, tpl, ctx);
      if (bodyChildren.length === 0) bodyChildren = [new Dx.Paragraph({ children: [] })];
      var cover = buildCoverChildren(meta, tpl);
      var sections = [];
      var pageProps = { properties: { page: { margin: tpl.page.margin } } };
      if (cover.length) sections.push(Object.assign({ children: cover }, pageProps));
      var bodySection = Object.assign({ children: bodyChildren }, pageProps);
      var footerObj = buildHF(overrides && overrides.footer, tpl, true, title);
      var headerObj = buildHF(overrides && overrides.header, tpl, false, title);
      if (footerObj) bodySection.footers = { default: footerObj };
      if (headerObj) bodySection.headers = { default: headerObj };
      sections.push(bodySection);
      var doc = new Dx.Document({ creator: 'MDocify', numbering: { config: ctx.numbering }, sections: sections });
      return Dx.Packer.toBlob(doc);
    });
  }

  window.MD2DOCX = { convert: convert };
})();
