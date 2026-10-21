// 계획서 판정기. 순수 함수(네트워크·DOM 없음) → 크롬과 Node에서 같은 결과.
// 상태: 확정 / 기간 / 주차 / 예상 / 시험 없음 / 계획서 없음 / 정보 부족 / ! (확인 필요)
// 원칙: '!'는 정보가 서로 어긋나거나 날짜가 하나로 모이지 않을 때만. 정보가 '없음'은 회색 상태로 사실대로 표시.
// 기준 구현: prototype/judge.py (Python). 같은 입력에 같은 결과를 내도록 맞춘다(test/parity.mjs).

import { isoIfValid, addDays, weekday, mmdd } from "./term.js";

// Python \b는 한글도 단어 글자로 본다. JS \b는 ASCII만 보므로 같은 뜻의 경계를 직접 쓴다.
const B = "(?![\\p{L}\\p{N}_])";
const BB = "(?<![\\p{L}\\p{N}_])";
const re = (src, flags = "iu") => new RegExp(src, flags);

const KIND = {
  exam: re(`([1-9])\\s*차\\s*시험|exam\\s*([1-9])${B}`),
  final: re("기말\\s*(고사|시험|exam|평가)?|final\\s*([\\p{L}\\p{N}_]+\\s+)?(exam(ination)?|test)"),
  midterm: re("중간\\s*(고사|시험|exam|평가\\s*시험)|mid-?\\s*term(\\s*exam(ination)?)?|중간\\s*평가"),
};
const EVAL_KIND = {
  exam: re(`([1-9])\\s*차\\s*시험|exam\\s*([1-9])${B}|test\\s*([1-9])${B}`),
  final: re("기말|final"),
  midterm: re("중간|mid-?\\s*term"),
};
const QUIZ = re("퀴즈|quiz|쪽지\\s*시험");
const POLICY = re("변경\\s*(이\\s*)?불가|결시.{0,15}(인정하지|불인정|0\\s*점|F)|재시험\\s*(은\\s*)?(없|불가|실시하지)|" +
  "no\\s+make-?up\\s+(exam|test)|(exam|test)s?\\s+(will\\s+not|cannot)\\s+be\\s+(re)?scheduled");
// 대체·부재. 강한 표현은 문장에서 다음 시험 단어 앞까지, 약한 표현은 그 '항목' 안에서만.
const STRONG = re("대체|없음|없다|없습니다|미실시|실시하지\\s*않|생략|휴강(?!\\s*시\\s*보강)|보충|보강|no\\s+class|" +
  "no\\s+(mid|final|exam)|not\\s+(hold|have)|replace[sd]?|instead\\s+of|in\\s+lieu\\s+of|대신|will\\s+not\\s+be\\s+(held|given)");
const WEAK = re("과제|레포트|리포트|report|project|프로젝트|에세이|essay|작품|portfolio|포트폴리오|발표|presentation|" +
  "paper|assignment|homework|제출|submit");
const NEG = re(`${STRONG.source}|${WEAK.source}`);
const CONJ = re("^\\s*(및|와|과|/|,|·|ㆍ|&|and|or)?\\s*$");
const SEP = re(",|;|/|·|ㆍ|\\+|&|\\s및\\s|\\sand\\s|\\s그리고\\s|\\s또는\\s", "giu");
const PERIOD_LABEL = re(`(고사|시험)\\s*기간|exam(ination)?\\s*(period|week)|period${B}`);
// 평가표 항목명용(나열의 '또는'도 모호함) / 본문용(나열의 or·또는은 불확실 아님)
const HEDGE_EVAL = re(`${BB}or${B}|또는|추후|변경\\s*(될|가능)|변동|미정|TBA|TBD|공지\\s*예정|협의|합의|결정\\s*(한다|할|예정)|` +
  "tentative|subject\\s+to|to\\s+be\\s+(announced|determined)");
const HEDGE = re("추후|변경\\s*(될|가능)|변동|미정|TBA|TBD|공지\\s*예정|협의|합의|결정\\s*(한다|할|예정)|" +
  "tentative|subject\\s+to|to\\s+be\\s+(announced|determined)");
const BOILER = re("법정\\s*수업\\s*일수|1회\\s*수업에\\s*해당|교원\\s*재량|시험\\s*시간\\s*연장|고사실\\s*제공|평가\\s*지원|" +
  "무감독\\s*시험|시험\\s*불응|부정행위|유인물로\\s*안내|문제지\\s*제공|답안지\\s*제출|지원\\s*인력");
const GENERIC = re("시험|고사|(?<![a-z])exam|(?<![a-z])tests?(?![a-z])|퀴즈|quiz");
const WEEK_ROW = re("^\\s*(?:week|w)?\\s*(1[0-6]|[1-9])\\s*(?:주차?|주)?\\s*(?:[|:]|\\s{2,}|$)");
export const WEEK_ROW_STRICT = re("^\\s*(?:week|w)?\\s*(1[0-6]|[1-9])\\s*(?:주차?|주)?\\s*(?:\\||\\s{2,}|$)");
const EXAM_WEEK = { midterm: new Set([8]), final: new Set([16]) };
const REVIEW = re("review|복습|리뷰|feedback|피드백|준비|prep|해설|정리|대비");
const LIST_ITEM = re("^\\s*\\(?([1-9])\\s*차(?!\\s*시)");
const EXAM_WORD = re("고사|시험|exam|test");
const TEMPORAL = re("^\\s*(\\(?\\s*\\))?\\s*(이후|후에?|전에?|이전|까지|대비|준비|직후|직전|after|before|until|prep|review)");
const CONDITIONAL = re("miss(es|ing|ed)?\\s|failure\\s+to|fail\\s+to|absen(t|ce)|결시|미응시|응시하지|불참|cheat|부정\\s*행위|" +
  "plagiar|make-?up\\s+(exam|test)");
const SENT_END = re("[.。!?](\\s|$)|다\\.|\\n", "gu");
const PASSFAIL = re(`P\\s*/\\s*F|pass\\s*/\\s*fail|이수\\s*/\\s*미이수|합격\\s*/\\s*불합격|S\\s*/\\s*U${B}`);
const EXPLICIT_NONE = re("(고사|시험|exam).{0,10}(없음|없다|없습니다|미실시)|no\\s+(mid|final|exam)");
const WD = "월화수목금토일";

// ── 날짜 ──
const EN_MON = { sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const D_NUM = "(1[0-2]|0?[1-9])\\s*(?:[/.]|월\\s*)\\s*(3[01]|[12]\\d|0?[1-9])(?!\\d)\\s*일?";
const D_EN = "(sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s*(3[01]|[12]\\d|0?[1-9])(?:st|nd|rd|th)?(?!\\d)";
const WDAY = "\\s*\\(?\\s*([월화수목금토일])(?:요일)?\\s*\\)?";
const RANGE = re(`(?:${D_NUM}|${D_EN})(?:${WDAY})?\\s*[~–\\-]\\s*(?:(?:${D_NUM})|(?:${D_EN})|(3[01]|[12]\\d|0?[1-9])\\s*일?)(?!\\s*[:시])`, "giu");
const SINGLE = re(`(?<![\\d.])(?:${D_NUM}|${D_EN})(?:${WDAY})?`, "giu");
const TIME = re("(\\d{1,2}):(\\d{2})\\s*[~–-]\\s*(\\d{1,2}):(\\d{2})|(?<![\\d:])(\\d{1,2}):(\\d{2})(?![\\d:])|" +
  "(오전|오후)\\s*(\\d{1,2})\\s*시(\\s*\\d{1,2}\\s*분)?|(\\d{1,2})\\s*시(\\s*\\d{1,2}\\s*분)?\\s*[~–-]\\s*(\\d{1,2})\\s*시(\\s*\\d{1,2}\\s*분)?");

const md = (mNum, dNum, mEn, dEn) => mNum ? [Number(mNum), Number(dNum)]
  : [EN_MON[mEn.toLowerCase().startsWith("sept") ? "sept" : mEn.toLowerCase().slice(0, 3)], Number(dEn)];

/** 텍스트 안의 날짜: singles [{pos, d, bad}], ranges [{pos, a:[m,d], b:[m,d]}]. 범위 안 날짜는 단일로 안 셈. */
function datesIn(text, term) {
  const ranges = [];
  let masked = text;
  for (const m of text.matchAll(RANGE)) {
    const a = md(m[1], m[2], m[3], m[4]);
    if (!term.months.has(a[0])) continue;
    const b = m[6] || m[8] ? md(m[6], m[7], m[8], m[9]) : [a[0], Number(m[10])];
    ranges.push({ pos: m.index, a, b });
    masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  const singles = [];
  for (const m of masked.matchAll(SINGLE)) {
    const [mo, da] = md(m[1], m[2], m[3], m[4]);
    if (!term.months.has(mo)) continue;
    const d = isoIfValid(term.yearOf(mo), mo, da);
    if (!d) continue;
    singles.push({ pos: m.index, d, bad: Boolean(m[5]) && WD[weekday(d)] !== m[5] });
  }
  return { singles, ranges };
}

/** 키워드에서 가까운 항목: 뒤 60자 우선, 없으면 앞 40자 중 마지막 */
function near(items, pos, after = 60, before = 40) {
  const fwd = items.filter((x) => x.pos - pos >= 0 && x.pos - pos <= after);
  if (fwd.length) return fwd;
  return items.filter((x) => pos - x.pos >= 0 && pos - x.pos <= before).slice(-1);
}

const rangeKey = (r) => `${String(r.a[0]).padStart(2, "0")}-${String(r.a[1]).padStart(2, "0")}~${String(r.b[0]).padStart(2, "0")}-${String(r.b[1]).padStart(2, "0")}`;
const fmtRange = (k) => k.split("~").map((s) => s.split("-").map(Number).join("/")).join("~");
const rangeIso = (k, term) => k.split("~").map((s) => { const [m, d] = s.split("-").map(Number); return isoIfValid(term.yearOf(m), m, d); });

// ── 평가표 ──
/** {key: [[점수, 시험인가, 원문]]}. 공식 평가표 + (공식이 없을 때) 첨부의 배점 행. */
function evalItems(evlJson, units) {
  const rows = evlJson.map((e) => [String(e.evlItemCtnt || ""), e.evlSco || 0]);
  for (const [text, src] of units) {
    if (src.kind !== "file") continue;
    for (const rx of Object.values(EVAL_KIND)) {
      for (const m of text.matchAll(new RegExp(rx.source, "giu"))) {
        const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
        const cells = tail.split("|");
        if (cells.length >= 2) {                                   // 표 행: 점수는 바로 다음 칸에만
          const cell = cells[1].trim();
          const pc = (cell + " ").match(/^(\d{1,3})\s*(%|점|percent)?(\s|$|\()/i);
          const item = (text.slice(Math.max(0, m.index - 3), m.index + m[0].length) + cells[0]).trim();
          if (pc) rows.push([`${item} | ${cell}`, Number(pc[1])]);
          else if (/^([-–]|0|없음|N\/?A|none)$/i.test(cell)) rows.push([`${item} | ${cell}`, 0]);
        } else {                                                   // 문장형: '중간고사(30%)'
          const pc = tail.slice(0, 15).match(/(\d{1,3})\s*(%|점)/);
          if (pc) rows.push([text.slice(Math.max(0, m.index - 3), m.index + m[0].length + pc.index + pc[0].length), Number(pc[1])]);
        }
      }
    }
  }
  const out = {};
  for (const [item, score] of rows) {
    for (const [k, rx] of Object.entries(EVAL_KIND)) {
      const m = item.match(rx);
      if (!m) continue;
      const key = k + (k === "exam" ? (m[1] || m[2] || m[3] || "") : "");
      (out[key] ||= []).push([score, !NEG.test(item), item.trim().slice(0, 60)]);
    }
  }
  return out;
}

// ── 대체·부재 판단 범위 ──
function lastEnd(rx, s, from, to) {
  let end = from;
  for (const e of s.slice(from, to).matchAll(rx)) end = from + e.index + e[0].length;
  return end;
}

function region(text, m) {
  if (!text.includes("|")) return [0, text.length];
  const cells = text.split("|");
  let pos = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (pos <= m.index && m.index < pos + c.length + 1) {
      let end = pos + c.length;
      const nxt = i + 1 < cells.length ? cells[i + 1] : "";
      if (text.slice(m.index + m[0].length, end).trim().length < 4 && nxt &&
          !/\d\s*(%|점|pts)|^\s*[\d.\s~\-/()월화수목금토일]+$/.test(nxt)) end += 1 + nxt.length;
      return [pos, end];
    }
    pos += c.length + 1;
  }
  return [0, text.length];
}

function negation(text, m, found) {
  const mEnd = m.index + m[0].length;
  const [r0, r1] = region(text, m);
  const s0 = lastEnd(SENT_END, text, r0, m.index);
  const se = [...text.slice(mEnd, r1).matchAll(SENT_END)][0];
  const s1 = se ? mEnd + se.index + se[0].length : r1;
  const starts = found.map(([, x]) => x.index).sort((a, b) => a - b);
  const ends = new Map(found.map(([, x]) => [x.index, x.index + x[0].length]));
  let cur = mEnd, nxt = s1;
  for (const p of starts.filter((p) => m.index < p && p < s1)) {
    if (CONJ.test(text.slice(cur, p))) { cur = ends.get(p); continue; }   // '중간고사 및 기말고사는 없음'
    nxt = p; break;
  }
  const flat = text.replaceAll("|", " ");
  const f0 = lastEnd(SENT_END, flat, 0, m.index);
  let head = m.index;
  for (const [, x] of [...found].filter(([, x]) => x.index + x[0].length <= m.index).sort((a, b) => b[1].index - a[1].index)) {
    if (CONJ.test(flat.slice(x.index + x[0].length, head))) { head = x.index; continue; }  // 'mid-term and final exams'
    break;
  }
  const endsBefore = (lim) => found.map(([, x]) => x.index + x[0].length).filter((e) => e <= lim);
  const prevKind = Math.max(...endsBefore(head), s0);
  const strongPre = flat.slice(Math.max(...endsBefore(head), f0, lastEnd(SEP, flat, f0, head)), head);
  const preSep = Math.max(lastEnd(SEP, text, s0, m.index), prevKind);
  const strongWin = text.slice(preSep, nxt);
  const ps = [...text.slice(cur, nxt).matchAll(SEP)][0];
  let item = text.slice(preSep, ps ? cur + ps.index : nxt);
  const par = text.slice(mEnd).match(/^\s*\([^)]{0,40}\)/);   // '기말고사(과제, 보고서)'
  if (par) item += par[0];
  return [STRONG.test(strongPre) || STRONG.test(strongWin) || WEAK.test(item), text.slice(Math.max(s0, m.index - 15), nxt)];
}

// ── 본문 언급 수집 ──
// 퀴즈: 날짜(같은 날 하나로) → 주차 → 날짜 없는 언급 하나
function quizzes(list) {
  const out = [], seen = new Set();
  for (const q of [...list.filter((x) => x.date), ...list.filter((x) => !x.date && x.week), ...list.filter((x) => !x.date && !x.week).slice(0, 1)]) {
    const k = q.date ?? (q.week ? `w${q.week}` : "-");
    if (!seen.has(k)) { seen.add(k); out.push(q); }
  }
  return out.slice(0, 10);
}

/** 시험 대신 다른 평가: '발표 대체'·'과제 대체'·'대체'. '없음·휴강'처럼 대신할 것을 말하지 않으면 null(대체라고 하지 않음) */
const ALT = re("대체|대신|replace[sd]?|instead\\s+of|in\\s+lieu\\s+of");
const altLabel = (s) => (/발표|presentation/i.test(s) ? "발표 대체" : WEAK.test(s) ? "과제 대체" : ALT.test(s) ? "대체" : null);
const pushAlt = (alt, exam, s) => { const label = altLabel(s); if (label) alt.push({ exam, label, text: s.slice(0, 80) }); };

const newFact = () => ({ pos: [], posSrc: new Set(), neg: [], label: [], dates: new Set(), bad: new Set(), ranges: new Set(),
  times: new Set(), hedge: false, weeks: new Set(), fweeks: new Set(), wdOk: new Set(), multi: false, ev: [] });

function collect(units, term) {
  const facts = {}, policy = [], quiz = [];
  let ctx = 0;
  for (let [text, src] of units) {
    text = text.normalize("NFC");
    if (BOILER.test(text)) continue;
    if (POLICY.test(text)) policy.push(text.trim().slice(0, 140));
    let found = [];
    for (const [k, rx] of Object.entries(KIND)) for (const m of text.matchAll(new RegExp(rx.source, "giu"))) found.push([k, m]);
    found.sort((a, b) => a[1].index - b[1].index || 0);
    if (!found.length && ctx) { const li = text.match(LIST_ITEM); if (li) found = [["exam", li]]; }
    ctx = found.length ? 5 : Math.max(ctx - 1, 0);
    const { singles, ranges } = datesIn(text, term);
    const qm = text.match(QUIZ);
    if (qm) {
      // 퀴즈 날짜는 보수적으로: 시험 단어가 없는 줄에서, 바로 곁 날짜가 하나뿐이고 요일·확정 표현이 맞을 때만. 아니면 '퀴즈 있음'(주차는 따로)
      const q = { text: text.trim().slice(0, 100) };
      const ds = found.length ? [] : near(singles, qm.index);
      if (ds.length === 1 && !ds[0].bad && !HEDGE.test(text)) q.date = ds[0].d;
      const qw = src.kind === "week" ? src.n : src.kind === "file" ? Number(text.match(WEEK_ROW)?.[1]) || null : null;
      if (!q.date && qw && !found.length) q.week = qw;
      quiz.push(q);
    }
    for (const [k, m] of found) {
      const key = k + (k === "exam" ? (m[1] || m[2] || "") : "");
      const f = (facts[key] ||= newFact());
      const mEnd = m.index + m[0].length;
      if (TEMPORAL.test(text.slice(mEnd))) continue;                               // '중간고사 이후 …'
      if (CONDITIONAL.test(text.slice(Math.max(0, m.index - 60), mEnd + 40))) continue; // 결시·미응시 조건문
      const [neg, seg] = negation(text, m, found);
      f.ev.push(`${src.kind}${src.n || ""}: ${text.trim().slice(0, 110)}`);
      const wr = src.kind === "file" ? text.match(WEEK_ROW) : null;
      const wk = src.kind === "week" ? src.n : wr ? Number(wr[1]) : null;
      if (neg) { f.neg.push(seg.trim()); continue; }
      if (PERIOD_LABEL.test(text.slice(m.index, mEnd + 25)) && !/\d\s*시|:\d\d/.test(seg)) {
        f.label.push(seg.trim());
        for (const r of near(ranges, m.index)) f.ranges.add(rangeKey(r));
        continue;
      }
      f.pos.push(seg.trim());
      f.posSrc.add(src.flag ? "flag" : (src.kind === "week" || wr) && seg.trim().length < 30 ? "weekcell" : "text");
      if (wk && !REVIEW.test(seg)) (src.flag ? f.fweeks : f.weeks).add(wk);
      for (const { pos, d, bad } of near(singles, m.index).slice(0, 1)) {
        (bad ? f.bad : f.dates).add(d);
        if (HEDGE.test(text.slice(m.index, pos + 45))) f.hedge = true;
        const sticky = new RegExp(SINGLE.source, "iuy");                          // 원문 위치에서 검사(앞 글자 조건 유지)
        sticky.lastIndex = pos;
        const dm = sticky.exec(text);
        if (dm && /^\s*[,/]\s*\d{1,2}\s*일?\s*\(?\s*[월화수목금토일]/.test(text.slice(pos + dm[0].length, pos + dm[0].length + 15)))
          f.multi = true;                                                          // '10/20(화), 22(목)'
        if (!bad && /^[^|]{0,14}?\(?\s*[월화수목금토일]/.test(text.slice(pos, pos + 16)) || /(mon|tue|wed|thu|fri|sat|sun)/i.test(text.slice(pos, pos + 25)))
          f.wdOk.add(d);
      }
      for (const r of near(ranges, m.index)) f.ranges.add(rangeKey(r));
      const t = text.slice(m.index, m.index + 90).match(TIME);
      if (t) f.times.add(t[0]);
      if (HEDGE.test(seg)) f.hedge = true;
    }
  }
  return { facts, policy, quiz };
}

const sortStr = (it) => [...it].sort();
const inter = (a, b) => [...a].filter((x) => b.has(x));

/**
 * @param units [[text, {kind:'field'|'week'|'file', n?, flag?, page?}]]
 * @param evlJson 공식 평가표 dsSles364
 * @returns {{result: object[], policy: string[], quiz: {text, date?, week?}[], alt: {exam, label, text}[]}}
 *   alt: 평가표·본문이 시험을 다른 평가로 대체한다고 적은 시험(결과에는 시험으로 넣지 않음)
 */
export function judge(units, evlJson, hasWeekTable, hasContent, term) {
  const { facts, policy, quiz } = collect(units, term);
  const alt = [];
  const evals = evalItems(evlJson, evlJson.length ? [] : units);           // 공식 평가표가 있으면 그것이 기준
  const hasEval = Object.keys(evals).length > 0 || evlJson.length > 0;
  const res = [];
  const keys = sortStr(new Set([...Object.keys(facts), ...Object.keys(evals)]));
  for (const key of keys) {
    const f = facts[key] || newFact();
    const base = key.replace(/\d+$/, "");
    let ev = evals[key] || [];
    const r = { exam: key, evidence: [...f.ev.slice(0, 3), ...ev.map((e) => `평가: ${e[2]} (${e[0]})`).slice(0, 2)] };
    // 평가표 항목명이 모호: '또는'이 붙었거나 시험 단어가 없음('Final', 'Final Research', '중간평가')
    const ambig = ev.filter((e) => HEDGE_EVAL.test(e[2]) || (e[1] && !EXAM_WORD.test(e[2])));
    ev = ev.filter((e) => !ambig.includes(e));
    if (ambig.length && !ev.some((e) => e[1] && e[0] > 0)) {
      const said = f.pos.some((x) => EXAM_WORD.test(x) && !/\d\s*(%|점|pts|points)/i.test(x)) ||
        (EXAM_WEEK[base] && inter(new Set([...f.weeks, ...f.fweeks]), EXAM_WEEK[base]).length > 0);  // 배점 설명은 근거 아님
      if (said && !ambig.some((e) => HEDGE_EVAL.test(e[2]))) ev = [...ev, ...ambig.map((e) => [e[0], true, e[2]])];
      else { res.push({ ...r, state: "!", why: `평가표 '${ambig[0][2].slice(0, 16)}' · 시험인지 불명` }); continue; }
    }
    const graded = ev.filter((e) => e[1] && e[0] > 0);
    const notExam = ev.filter((e) => !e[1] || e[0] === 0);
    const dates = sortStr(f.dates);
    if (graded.length) { /* 시험 있음 */ }
    else if (notExam.length) {                                            // 평가표가 '시험 아님'(대체/0%)을 명시
      if (f.pos.length && dates.length) res.push({ ...r, state: "!", why: "평가표는 대체/0%인데 본문에 시험 날짜", cand: dates });
      else { const t = notExam.find((e) => !e[1])?.[2]; if (t) pushAlt(alt, key, t); }   // 0%만이면 대체 아님
      continue;
    } else if (hasEval) {                                                  // 평가표에 이 시험 항목이 없음
      if (f.posSrc.has("text") || dates.length) res.push({ ...r, state: "!", why: "본문에 시험 언급 · 평가표에서 확인 안 됨" });
      continue;                                                             // 주차표 칸 라벨뿐이면 표시 안 함
    } else {                                                               // 평가표 자체가 없음
      if (f.pos.length && f.neg.length) { res.push({ ...r, state: "!", why: `시험 언급과 대체 표현이 함께 있음: ${f.neg[0].slice(0, 40)}` }); continue; }
      if (!f.pos.length) { if (f.neg.length) pushAlt(alt, key, f.neg[0]); continue; }
    }
    // ── 시험 있음. 날짜 판단 ──
    const weeks = f.weeks.size ? f.weeks : f.fweeks;
    const rng = sortStr(f.ranges);
    const cal = term.cal[base];
    if (f.neg.length && graded.length && !(dates.length || rng.length)) {
      res.push({ ...r, state: "!", why: `평가표엔 시험인데 본문에 대체 표현: ${f.neg[0].slice(0, 40)}` });
    } else if (f.bad.size) {
      res.push({ ...r, state: "!", why: "날짜와 요일이 달력과 안 맞음", cand: sortStr(f.bad) });
    } else if (dates.length === 1 && !f.hedge && !f.multi) {
      const d = dates[0];
      const window = rng.length ? rng.map((k) => { const [a, b] = rangeIso(k, term); return a <= d && d <= b; })
        : [cal ? cal[0] <= d && d <= cal[1] : true];
      const times = sortStr(f.times);
      if (!window.every(Boolean) && !f.wdOk.has(d)) res.push({ ...r, state: "!", why: "날짜가 시험 기간 밖", cand: [d] });
      else if (!window.every(Boolean)) {
        const offCal = cal && !(cal[0] <= d && d <= cal[1]);
        res.push({ ...r, state: "확정", date: d, time: times.length === 1 ? times[0] : null, why: offCal ? "공식 고사기간 밖(계획서에 요일까지 명시)" : "" });
      } else if (times.length > 1) res.push({ ...r, state: "!", why: "시각 후보 여러 개", date: d, cand: times });
      else res.push({ ...r, state: "확정", date: d, time: times[0] || null });
    } else if (dates.length > 1 || f.hedge || f.multi) {
      res.push({ ...r, state: "!", why: dates.length > 1 || f.multi ? "날짜 후보 여러 개" : "확정 아님 표현(추후/합의 등)", cand: dates });
    } else if (cal) {
      const off = [...weeks].filter((w) => !EXAM_WEEK[base].has(w)).sort((a, b) => a - b);
      const on = inter(weeks, EXAM_WEEK[base]);
      const calStr = `${mmdd(cal[0])}~${mmdd(cal[1])}`;
      if (rng.length > 1) res.push({ ...r, state: "!", why: "기간 후보 여러 개", cand: rng.map(fmtRange) });
      else if (rng.length) res.push({ ...r, state: "기간", date: fmtRange(rng[0]), why: "계획서 기재 기간 · 정확한 날짜 미기재" });
      else if (f.weeks.size && f.fweeks.size && !inter(f.weeks, f.fweeks).length)
        res.push({ ...r, state: "!", why: `주차표 기재 ${[...f.weeks].sort((a, b) => a - b)}주와 체크 ${[...f.fweeks].sort((a, b) => a - b)}주가 다름` });
      else if (off.length && (on.length || off.length > 1)) res.push({ ...r, state: "!", why: `시험 주차가 갈림 ${[...weeks].sort((a, b) => a - b)}` });
      else if (off.length) {
        const a = addDays(term.start, 7 * (off[0] - 1));
        res.push({ ...r, state: "주차", date: `${mmdd(a)}~${mmdd(addDays(a, 6))}`, why: `${off[0]}주차 수업시간(계획서 기재)` });
      } else if (on.length || f.label.length) res.push({ ...r, state: "기간", date: calStr, why: "고사기간 중(계획서 기재) · 정확한 날짜 미기재" });
      else res.push({ ...r, state: "예상", date: calStr, why: "계획서에 일정 없음 · 학교 고사기간 예상" });
    } else {
      res.push({ ...r, state: "!", why: "시험 있음 · 날짜 미기재" });                     // N차 시험 등
    }
  }
  if (!res.length) {
    const hit = units.find(([t]) => GENERIC.test(t) && !BOILER.test(t) && !QUIZ.test(t) && !Object.values(KIND).some((rx) => rx.test(t)));
    const explicitNone = units.some(([t]) => EXPLICIT_NONE.test(t));
    if (hit) res.push({ exam: "-", state: "!", why: `시험 관련 언급(종류·일정 불명): ${hit[0].trim().slice(0, 80)}` });
    else if (!hasEval && !explicitNone && Object.values(facts).some((f) => f.label.length))
      res.push({ exam: "-", state: "정보 부족", why: "고사기간 표시만 있고 평가표 없음 · 원문 확인" });
    else if (hasEval || hasWeekTable || explicitNone) res.push({ exam: "-", state: "시험 없음", why: "평가표/주차표에 시험 없음" });
    else if (units.some(([t]) => PASSFAIL.test(t))) res.push({ exam: "-", state: "시험 없음", why: "P/F 과목 · 시험 언급 없음" });
    else if (!hasContent) res.push({ exam: "-", state: "계획서 없음", why: "학교 시스템에 계획서 내용 없음" });
    else res.push({ exam: "-", state: "정보 부족", why: "계획서에 평가·일정 정보 없음 · 원문 확인" });
  }
  return { result: res, policy: policy.slice(0, 2), quiz: quizzes(quiz), alt };
}
