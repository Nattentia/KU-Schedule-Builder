// 첨부 리더. 출력은 줄 목록 [[text, page]] — 표는 한 행이 한 줄('칸 | 칸'), 판정기가 줄 단위로 읽는다.
// 외부 의존: PDF만 pdf.js(주입). HWP·DOCX·HWPX는 내장 API(DecompressionStream, TextDecoder)로 직접 읽는다.

/** raw deflate 풀기. HWP 스트림은 압축 끝 뒤에 여분 바이트가 붙어 있어(Python zlib은 무시),
 *  '끝 뒤 쓰레기' 오류가 나면 그때까지 풀린 데이터를 쓴다. 다른 오류는 그대로 던진다. */
async function inflateRaw(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts = [];
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); }
  } catch (e) {
    if (!/junk|trailing|after the end/i.test(String(e?.message)) || !parts.length) throw e;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ── OLE(CFB) 컨테이너: HWP 5.0 파일의 겉 포장 ──
const ENDOFCHAIN = 0xfffffffe, FREESECT = 0xffffffff;

function readCfb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u32 = (o) => dv.getUint32(o, true);
  const ss = 1 << dv.getUint16(0x1e, true), mss = 1 << dv.getUint16(0x20, true);
  const sector = (sid) => buf.subarray((sid + 1) * ss, (sid + 2) * ss);
  // FAT 섹터 목록(헤더 109칸 + DIFAT 사슬)
  const fatSids = [];
  for (let i = 0; i < 109; i++) fatSids.push(u32(0x4c + i * 4));
  for (let sid = u32(0x44), n = u32(0x48); n-- > 0 && sid < ENDOFCHAIN;) {
    const s = sector(sid), sdv = new DataView(s.buffer, s.byteOffset, ss);
    for (let i = 0; i < ss / 4 - 1; i++) fatSids.push(sdv.getUint32(i * 4, true));
    sid = sdv.getUint32(ss - 4, true);
  }
  const fat = [];
  for (const sid of fatSids.slice(0, u32(0x2c))) {
    const s = sector(sid), sdv = new DataView(s.buffer, s.byteOffset, ss);
    for (let i = 0; i < ss / 4; i++) fat.push(sdv.getUint32(i * 4, true));
  }
  const chain = (sid, table) => { const out = []; while (sid < ENDOFCHAIN && out.length <= table.length) { out.push(sid); sid = table[sid]; } return out; };
  const concat = (parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  const readChain = (sid) => concat(chain(sid, fat).map(sector));
  // 디렉터리
  const dir = readChain(u32(0x30)), ddv = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = ddv.getUint16(o + 64, true);
    entries.push({ name: new TextDecoder("utf-16le").decode(dir.subarray(o, o + Math.max(0, nl - 2))), type: dir[o + 66],
      left: ddv.getUint32(o + 68, true), right: ddv.getUint32(o + 72, true), child: ddv.getUint32(o + 76, true),
      start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true) });
  }
  // 작은 스트림(4096B 미만)은 mini stream 안에 64B 단위로
  const miniFat = [];
  { const m = u32(0x3c) < ENDOFCHAIN ? readChain(u32(0x3c)) : new Uint8Array(0), mdv = new DataView(m.buffer);
    for (let i = 0; i + 4 <= m.length; i += 4) miniFat.push(mdv.getUint32(i, true)); }
  const miniStream = entries[0].start < ENDOFCHAIN ? readChain(entries[0].start) : new Uint8Array(0);
  const cutoff = u32(0x38);
  const read = (e) => e.size < cutoff
    ? concat(chain(e.start, miniFat).map((s) => miniStream.subarray(s * mss, (s + 1) * mss))).subarray(0, e.size)
    : readChain(e.start).subarray(0, e.size);
  const children = (id) => { const out = [], walk = (i) => { if (i === FREESECT || i >= entries.length) return; walk(entries[i].left); out.push(entries[i]); walk(entries[i].right); }; walk(entries[id].child); return out; };
  return { entries, children, read, root: 0 };
}

// ── HWP 5.0 ──
const TAG_PARA_HEADER = 66, TAG_PARA_TEXT = 67, TAG_LIST_HEADER = 72, TAG_TABLE = 77;
const EXT_CTRL = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23, 4, 5, 6, 7, 8, 9, 19, 20]);  // 8 WCHAR 컨트롤

function paraText(b) {
  const w = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~1)));
  const out = [];
  for (let j = 0; j < w.length;) {
    const c = w[j];
    if (EXT_CTRL.has(c)) { if (c === 9) out.push(32); j += 8; continue; }
    if (c === 10 || c === 13) { out.push(32); j++; continue; }
    if (c >= 32) out.push(c);
    j++;
  }
  return new TextDecoder("utf-16le").decode(new Uint16Array(out)).trim();   // 서로게이트 쌍도 한 글자로
}

function* records(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i + 4 <= data.length;) {
    const h = dv.getUint32(i, true); i += 4;
    const tag = h & 0x3ff, level = (h >>> 10) & 0x3ff;
    let size = h >>> 20;
    if (size === 0xfff) { size = dv.getUint32(i, true); i += 4; }
    yield [tag, level, data.subarray(i, i + size)];
    i += size;
  }
}

/** HWP 5.0 → 줄 목록. 배포용(암호) 문서는 빈 목록. 표는 행 단위로 복원. */
export async function readHwp(bytes) {
  const cfb = readCfb(bytes);
  const top = cfb.children(cfb.root);
  const header = top.find((e) => e.name === "FileHeader");
  const flags = new DataView(cfb.read(header).buffer).getUint32(36, true);
  if (flags & 4) return [];
  const body = top.find((e) => e.name === "BodyText");
  const sections = cfb.children(cfb.entries.indexOf(body)).filter((e) => /^Section\d+$/.test(e.name))
    .sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7)));
  const lines = [];
  for (const sec of sections) {
    let data = cfb.read(sec);
    if (flags & 1) data = await inflateRaw(data);
    const tables = [];                                  // {level, cells: Map('row,col' → [text]), cur}
    for (const [tag, level, b] of records(data)) {
      while (tables.length && tag === TAG_PARA_HEADER && level <= tables.at(-1).level) {
        const t = tables.pop(), rows = new Map();       // 표가 닫힘 → 행 단위로 내보내기
        for (const [rc, txt] of t.cells) {
          const [r, c] = rc.split(",").map(Number);
          if (!rows.has(r)) rows.set(r, []);
          rows.get(r).push([c, txt.filter(Boolean).join(" ")]);
        }
        const rendered = [...rows.keys()].sort((a, b) => a - b)
          .map((r) => rows.get(r).sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter(Boolean).join(" | "));
        const target = tables.length ? (tables.at(-1).cells.get(tables.at(-1).cur) ?? tables.at(-1).cells.set(tables.at(-1).cur, []).get(tables.at(-1).cur)) : null;
        for (const row of rendered) if (row) (target ? target.push(row) : lines.push(row));
      }
      if (tag === TAG_TABLE) tables.push({ level: level - 1, cells: new Map(), cur: null });
      else if (tag === TAG_LIST_HEADER && tables.length && level === tables.at(-1).level + 1 && b.length >= 12) {
        const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
        tables.at(-1).cur = `${v.getUint16(10, true)},${v.getUint16(8, true)}`;   // row, col
      } else if (tag === TAG_PARA_TEXT) {
        const txt = paraText(b), t = tables.at(-1);
        if (t && t.cur !== null) { if (!t.cells.has(t.cur)) t.cells.set(t.cur, []); t.cells.get(t.cur).push(txt); }
        else if (txt) lines.push(txt);
      }
    }
  }
  return lines.map((l) => [l, 1]);
}

// ── ZIP + XML: DOCX, HWPX ──
async function unzip(bytes, want) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("zip: EOCD 없음");
  const out = {};
  for (let i = 0, p = dv.getUint32(eocd + 16, true), n = dv.getUint16(eocd + 10, true); i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl));
    const lh = dv.getUint32(p + 42, true);
    if (want(name)) {
      const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
      const raw = bytes.subarray(start, start + csize);
      out[name] = method === 8 ? await inflateRaw(raw) : raw;
    }
    p += 46 + nl + xl + cl;
  }
  return out;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m);

/** 아주 작은 XML 트리: {name(접두사 없는 이름), children, text} */
function parseXml(xml) {
  const root = { name: "#root", children: [] }, stack = [root];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)|<[!?][^>]*>/g)) {
    if (m[4] !== undefined) { stack.at(-1).children.push({ name: "#text", text: unescape(m[4]) }); continue; }
    if (!m[2]) continue;
    const name = m[2].includes(":") ? m[2].split(":").pop() : m[2];
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const node = { name, children: [] };
    stack.at(-1).children.push(node);
    if (!m[3]) stack.push(node);
  }
  return root;
}

function textOf(node) {
  let s = "";
  const walk = (n) => { for (const c of n.children || []) { if (c.name === "t") s += c.children.filter((x) => x.name === "#text").map((x) => x.text).join(""); else walk(c); } };
  walk(node);
  return s.trim();
}

const descendants = function* (n) { for (const c of n.children || []) { yield c; yield* descendants(c); } };

/** DOCX(word/document.xml) · HWPX(Contents/section*.xml) → 줄 목록. 표는 행 단위. */
export async function readZipXml(bytes) {
  const files = await unzip(bytes, (n) => n === "word/document.xml" || /^Contents\/section\d+\.xml$/.test(n));
  const parts = files["word/document.xml"] ? ["word/document.xml"] : Object.keys(files).sort();
  const lines = [];
  const walk = (node) => {
    for (const c of node.children || []) {
      if (c.name === "tbl") {
        for (const tr of descendants(c)) {
          if (tr.name !== "tr") continue;
          const row = tr.children.filter((x) => x.name === "tc").map(textOf).filter(Boolean).join(" | ");
          if (row) lines.push(row);
        }
      } else if (c.name === "p" && [...descendants(c)].some((x) => x.name === "tbl")) walk(c);   // HWPX: 문단 안의 표
      else if (c.name === "p") { const t = textOf(c); if (t) lines.push(t); }
      else walk(c);
    }
  };
  for (const name of parts) walk(parseXml(new TextDecoder().decode(files[name])));
  return lines.map((l) => [l, 1]);
}

// ── PDF (pdf.js 주입) ──
const GAP = 1.0;      // 칸 간격 ≥ 글자 높이 → 다른 칸
const ROW_TOL = 0.8;  // |y 차이| < 글자 높이×0.8 → 같은 행 (250분반 판정 비교로 정함)
/** pdfjs: pdf.js 모듈. 같은 줄(y 좌표)의 글자 조각을 이어 한 줄로, 큰 간격은 ' | '. */
export async function readPdf(bytes, pdfjs) {
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str.trim()) continue;                       // 공백 조각은 칸 간격을 덮으므로 버린다
      const y = it.transform[5], x = it.transform[4];
      const h = Math.abs(it.transform[3]) || it.height || 10;
      let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2.5, h * ROW_TOL));   // 세로 가운데 정렬된 칸도 같은 행
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, w: it.width, s: it.str, h: Math.abs(it.transform[3]) || it.height || 10 });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      let line = "", end = null;
      for (const q of r.parts) {
        // 칸 간격: 글자 높이 이상 벌어지면 다른 칸(pypdf layout의 '공백 3칸 이상'과 같은 기준)
        if (end !== null) line += q.x - end >= q.h * GAP ? " | " : q.x - end > q.h * 0.15 ? " " : "";
        line += q.s; end = q.x + q.w;
      }
      line = line.replace(/\s{3,}/g, " | ").replace(/\s+/g, " ").replace(/(\s*\|\s*)+/g, " | ").trim().replace(/^\|\s*|\s*\|$/g, "");
      if (line) lines.push([line, p]);
    }
  }
  await doc.destroy();
  return lines;
}

/** 글자 깨짐 검사: 한글·영문·숫자 비율이 60% 이하면 읽지 못한 것으로 본다. */
export function readableText(lines) {
  const s = lines.map((l) => l[0]).join("").replace(/[\s|]/g, "");
  if (!s) return false;
  return (s.match(/[가-힣A-Za-z0-9]/g) || []).length / s.length > 0.6;
}

export const READERS = { hwp: readHwp, docx: readZipXml, hwpx: readZipXml };   // pdf는 pdf.js가 필요해 따로
