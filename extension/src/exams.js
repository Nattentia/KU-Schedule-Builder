// 화면용 시험 요약(순수). 후보 순서에는 쓰지 않는다.
import { weekday, iso } from "./term.js";

const LABEL = { midterm: "중간", final: "기말", quiz: "퀴즈" }, SHORT = { midterm: "중", final: "기", quiz: "퀴" };
export const examLabel = (exam, short = false) => (short ? SHORT : LABEL)[exam] ?? (exam.match(/^exam(\d+)$/)?.[1] ? `${exam.slice(4)}차` : "");
const sig = (x) => `${x.state}|${x.date ?? ""}|${x.time ?? ""}`;

/**
 * 한 과목이 쓰는 분반들(cls 목록)의 시험. 분반이 여럿이면 시험마다 모든 분반이 같을 때만 공통값, 다르면 differ.
 * 시험 대신 다른 평가(alt)는 모든 분반이 같을 때만 '대체' 항목으로 넣고, 그때 '시험 없음'은 뺀다.
 * 날짜 있는 퀴즈는 모든 분반에 같은 날짜가 있을 때만 quiz에 담는다(달력용, 시험 겹침 계산에는 안 씀).
 * @param analyses (cls) => {result:[...], alt?, quiz?} | {failed:string} | undefined(아직)
 * @returns {{pending:boolean, failed:string|null, items:[{exam, state, date?, time?, why?, differ?, label?}], quiz:string[]}}
 */
export function examsOf(clsList, analyses) {
  if (!clsList.length) return { pending: false, failed: null, items: [], quiz: [] };   // 분반을 모두 뺀 과목
  const got = clsList.map(analyses);
  const failed = got.find((a) => a?.failed)?.failed ?? null;
  if (got.some((a) => !a)) return { pending: true, failed, items: [], quiz: [] };
  if (failed) return { pending: false, failed, items: [], quiz: [] };
  const rank = (k) => ({ midterm: 0, final: 1 })[k] ?? 2;
  const keys = [...new Set(got.flatMap((a) => a.result.map((x) => x.exam)))].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  let items = keys.map((exam) => {
    const per = got.map((a) => a.result.find((x) => x.exam === exam));
    return per.every((x) => x && sig(x) === sig(per[0])) ? per[0] : { exam, state: "다름", differ: true };
  });
  const alts = (got[0].alt ?? []).filter((x) => !keys.includes(x.exam) && got.every((a) => (a.alt ?? []).some((y) => y.exam === x.exam && y.label === x.label)));
  if (alts.length) items = [...items.filter((x) => x.state !== "시험 없음"), ...alts.map((x) => ({ exam: x.exam, state: "대체", label: x.label }))]
    .sort((a, b) => rank(a.exam) - rank(b.exam));
  const dated = (a) => new Set((a.quiz ?? []).map((q) => q.date).filter(Boolean));
  const quiz = [...dated(got[0])].filter((d) => got.every((a) => dated(a).has(d))).sort();
  return { pending: false, failed: null, items, quiz };
}

const md = (isoDate) => `${+isoDate.slice(5, 7)}/${+isoDate.slice(8)}`;

/** 시험 하나 → 줄에 쓸 짧은 말과 톤(ok|muted|warn). short: 사이드 패널 한 줄용(중/기) */
export function examText(x, short = false) {
  const l = examLabel(x.exam, short);
  if (x.differ) return { text: `${l} ${short ? "분반별" : "분반마다 다름"}`, tone: "muted" };
  if (x.exam === "첨부") return { text: "첨부 일부 못 읽음", tone: "warn" };
  switch (x.state) {
    case "확정": {
      const wd = weekday(x.date);
      return { text: `${l} ${md(x.date)}${wd >= 5 ? `(${"토일"[wd - 5]})` : ""}${x.time && !short ? ` ${x.time}` : ""}`, tone: "ok" };
    }
    case "기간": case "주차": {
      const r = x.date.replace(/\b0(\d)/g, "$1");
      return { text: `${l} ${short ? r.replace(/^(\d+)\/(\d+)~\1\//, "$1/$2~") : r}`, tone: "ok" };   // 같은 달이면 6/16~22
    }
    case "예상": return { text: `${l} 예상`, tone: "muted" };
    case "대체": return { text: short ? `${l} ${x.label.replace(" ", "")}` : `${l} → ${x.label}`, tone: "muted" };
    case "시험 없음": return { text: "시험 없음", tone: "muted" };
    case "계획서 없음": case "정보 부족": return { text: "시험 정보 부족", tone: "muted" };
    default: return { text: `${l ? l + " " : ""}!${short ? "" : " 확인"}`, tone: "warn" };
  }
}

/** 후보의 과목별 확정 시험일이 같은 날인 쌍 → Map(code → [{date, other}]) */
export function examClashes(byCode) {
  const days = new Map();
  for (const [code, ex] of byCode) for (const x of ex.items) if (x.state === "확정") (days.get(x.date) ?? days.set(x.date, []).get(x.date)).push(code);
  const out = new Map();
  for (const [date, codes] of days) for (const c of new Set(codes)) for (const o of new Set(codes)) if (c !== o)
    (out.get(c) ?? out.set(c, []).get(c)).push({ date, other: o });
  return out;
}

/** 달력용 일정: 확정은 하루(시각 포함), 기간·주차는 범위, 날짜 있는 퀴즈는 하루(quiz). 예상·!·분반마다 다름·대체는 찍지 않는다. */
export function calendarEvents(byCode, term) {
  const ev = [];
  for (const [code, ex] of byCode) for (const x of ex.items) {
    if (x.state === "확정") ev.push({ code, exam: x.exam, from: x.date, to: x.date, exact: true, time: x.time ?? null });
    else if (x.state === "기간" || x.state === "주차") {
      const [a, b] = [...x.date.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map((m) => iso(term.yearOf(+m[1]), +m[1], +m[2]));
      if (a && b) ev.push({ code, exam: x.exam, from: a, to: b, exact: false });
    }
  }
  for (const [code, ex] of byCode) for (const d of ex.quiz ?? []) ev.push({ code, exam: "quiz", from: d, to: d, exact: true, quiz: true, time: null });
  return ev;
}
