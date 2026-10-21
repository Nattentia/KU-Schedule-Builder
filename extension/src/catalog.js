// 개설과목 행 → 과목(학수번호)·분반·시간 묶음. 순수 함수.

// 교시 → [시작, 끝](분). sugang '교시확인표'(정규학기·서울) 실측 2026-10-13.
// 서울 정규학기 표에는 11교시 이상이 없다 → 그 분반은 '시간 확인 필요'(추정하지 않음).
export const PERIODS = {
  0: [480, 530], 1: [540, 615], 2: [630, 705], 3: [720, 795], 4: [810, 885], 5: [900, 975], 6: [990, 1065],
  7: [1080, 1130], 8: [1140, 1190], 9: [1200, 1250], 10: [1260, 1310],
};
export const DAYS = "월화수목금토일";
const SLOT = /^([월화수목금토일])\((-?\d+)(?:-(-?\d+))?\)/;

const UNKNOWN = { state: "unknown", slots: [] };
// 비고(APPLY_DEPT)의 실제 수업시간: '[강의시간] 수 1교시(09:00~10:55)', '화(13:00~14:50)', '*수업시간 15:00-17:45', '1:30-5:05'
const NOTE_RANGE = /(?:([월화수목금토일])[^\d:<]{0,4}?(?:\d{1,2}(?:\s*~\s*\d{1,2})?\s*교시)?\s*\(\s*)?(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g;
const toMin = (h, m) => (+h < 8 ? +h + 12 : +h) * 60 + +m;     // '1:30-5:05'처럼 12시간제로 적힌 오후 수업

/**
 * TIME_ROOM 한 칸 → {state:'ok'|'none'|'unknown', slots:[{day,start,end}]}
 * note(비고)에 실제 수업시간이 있으면 교시 구간을 그 시간까지 넓힌다(겹침을 놓치지 않는 쪽). 읽을 수 없는 시각 언급은 확인 필요.
 */
export function parseTime(timeRoom, time, note = "") {
  const text = String(timeRoom ?? "").trim();
  // 빈 칸 + 주당 수업시간 0(예: '3(0)', 현장실습류)만 '시간 없음'으로 인정한다. 나머지 빈 칸·'미정'은 확인 필요.
  if (!text) return /\(0(\.0+)?\)\s*$/.test(String(time ?? "")) ? { state: "none", slots: [] } : UNKNOWN;
  const slots = [];
  for (const part of text.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(SLOT);
    if (!m) return UNKNOWN;
    const a = PERIODS[m[2]], b = PERIODS[m[3] ?? m[2]];
    if (!a || !b || b[1] <= a[0]) return UNKNOWN;
    slots.push({ day: DAYS.indexOf(m[1]), start: a[0], end: b[1] });
  }
  const n = String(note ?? "");
  const ranges = [...n.matchAll(NOTE_RANGE)];
  if (/\d{1,2}\s*:\s*\d{2}/.test(n.replace(NOTE_RANGE, ""))) return UNKNOWN;   // '수업시작시간 9:30' 같은 해석 못 하는 시각
  for (const r of ranges) {
    const s = toMin(r[2], r[3]), e = toMin(r[4], r[5]);
    const hit = slots.filter((x) => !r[1] || x.day === DAYS.indexOf(r[1]));
    if (e <= s || !hit.length) return UNKNOWN;
    for (const x of hit) { x.start = Math.min(x.start, s); x.end = Math.max(x.end, e); }
  }
  return { state: "ok", slots: dedupe(slots) };
}

const dedupe = (slots) => [...new Map(slots.map((s) => [`${s.day}:${s.start}:${s.end}`, s])).values()]
  .sort((x, y) => x.day - y.day || x.start - y.start || x.end - y.end);

export const slotKey = (slots) => slots.map((s) => `${s.day}:${s.start}-${s.end}`).join(",");

export const splitProfs = (s) => String(s ?? "").split(/,|\r|\n|<br\s*\/?>/i).map((x) => x.trim()).filter(Boolean);

const num = (s) => { const n = Number(String(s ?? "").trim()); return Number.isFinite(n) && n >= 0 && String(s).trim() !== "" ? n : null; };

/** 카탈로그 행들 → Map(code → {code, name, credit|null, sections:[{cls, profs, time, row}]}) */
export function buildCourses(rows) {
  const out = new Map();
  for (const row of rows) {
    const code = String(row.COUR_CD);
    let c = out.get(code);
    if (!c) out.set(code, (c = { code, name: String(row.COUR_NM ?? "").normalize("NFC"), credit: num(row.CREDIT), sections: [] }));
    else if (c.credit !== num(row.CREDIT)) c.credit = null;          // 분반 학점이 다르면 대표값을 고르지 않는다
    const note = String(row.APPLY_DEPT ?? "").split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean).join(" · ");
    c.sections.push({ cls: String(row.COUR_CLS), profs: splitProfs(row.PROF_NM), time: parseTime(row.TIME_ROOM, row.TIME, note), note, row });
  }
  for (const c of out.values()) c.sections.sort((a, b) => a.cls.localeCompare(b.cls, "ko", { numeric: true }));
  return out;
}

/** 제외 분반을 뺀 시간 묶음. 시간 확인 필요 분반은 빠진다. */
export function bundlesOf(course, excluded = []) {
  const m = new Map();
  for (const s of course.sections) {
    if (excluded.includes(s.cls) || s.time.state === "unknown") continue;
    const key = slotKey(s.time.slots);
    if (!m.has(key)) m.set(key, { key, slots: s.time.slots, cls: [] });
    m.get(key).cls.push(s.cls);
  }
  return [...m.values()];
}

/**
 * 빈 칸 검색(SNUTT 시간대 검색): 그 요일·시각(분)에 수업이 있고, busy(지금 시간표의 다른 과목 칸)와 하나도 겹치지 않는 분반 번호들.
 * 빈 배열이면 그 시간에 들을 수 없는 과목.
 */
export function fitsAt(course, day, minute, busy, excluded = []) {
  const hit = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;
  return course.sections.filter((s) => !excluded.includes(s.cls) && s.time.state === "ok"
    && s.time.slots.some((t) => t.day === day && t.start <= minute && minute < t.end)
    && !s.time.slots.some((t) => busy.some((b) => hit(t, b)))).map((s) => s.cls);
}

/** 과목이 자동 후보에 못 드는 확실한 사유(없으면 null) */
export function blockReason(course, excluded = []) {
  if (course.credit === null) return "학점 확인 필요";
  const live = course.sections.filter((s) => !excluded.includes(s.cls));
  if (!live.length) return "모든 분반 제외";
  if (live.every((s) => s.time.state === "unknown")) return "시간 확인 필요";
  return null;
}

/** 공식 계획서 화면 링크 */
export function syllabusUrl(row) {
  const p = { syy: row.YEAR, smtDivcd: row.TERM, faclyGschDeptCd: row.GRAD_CD, estblDeprtCd: row.DEPT_CD, sbjtnb: row.COUR_CD, dvcno: row.COUR_CLS };
  return `https://ams.korea.ac.kr/com/lgin/SsoCtr/initExtPageWork.do?link=lctreSylla&locale=ko&params=${encodeURIComponent(btoa(JSON.stringify(p)))}`;
}
