// 시험 달력: 한 달씩 ‹ ›로 넘긴다. 아래에 그 달의 시험 일정을 날짜순으로 적는다.
// 표시 세 가지가 서로 달라 보이게: 확정 시험일 = 과목 색 칸에 과목명, 학사일정 시험 주간 = 옅은 바탕(빈 날은 숫자만),
// 과목이 따로 정한 시험 기간 = 칸 아래 과목 색 줄(학사일정 시험 주간과 같으면 겹치므로 줄을 긋지 않고 목록에만 적음),
// 날짜가 적힌 퀴즈 = 과목 색 테두리 이름표(속이 빔).
import { iso, addDays, weekday } from "../src/term.js";
import { examLabel } from "../src/exams.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const WD = "월화수목금토일";
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

/** 넘길 수 있는 달: 개강 달부터 기말 끝 달까지 ['YYYY-MM', ...] */
export function calMonths(term) {
  const out = [term.start.slice(0, 7)];
  while (out.at(-1) < term.final[1].slice(0, 7)) out.push(nextYm(out.at(-1)));
  return out;
}

/**
 * @param ym 'YYYY-MM' (calMonths 안의 값)
 * @param nameOf code → 과목명, colorOf code → 색 번호
 */
export function calendarHtml(term, events, { ym, colorOf, nameOf }) {
  const months = calMonths(term), at = months.indexOf(ym);
  const inPeriod = (d) => [term.midterm, term.final].some(([a, b]) => a <= d && d <= b);
  const [y, m] = ym.split("-").map(Number);
  const first = iso(y, m, 1);
  const cells = Array(weekday(first)).fill("<div></div>");
  const inWeek = (e) => [term.midterm, term.final].some(([a, b]) => a <= e.from && e.to <= b);
  for (let d = first; d.startsWith(ym); d = addDays(d, 1)) {
    const evs = events.filter((e) => e.from <= d && d <= e.to);
    cells.push(`<div class="day${inPeriod(d) ? " period" : ""}"><span>${+d.slice(8)}</span>${
      evs.filter((e) => e.exact).map((e) => `<b class="ex${e.quiz ? " q" : ""} c${colorOf(e.code)}">${esc(nameOf(e.code))}</b>`).join("")}${
      evs.filter((e) => !e.exact && !inWeek(e)).map((e) => `<i class="bar c${colorOf(e.code)}"></i>`).join("")}</div>`);
  }
  const mine = events.filter((e) => e.from < `${nextYm(ym)}-01` && e.to >= first).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const when = (e) => (e.exact ? `${md(e.from)}(${WD[weekday(e.from)]})${e.time ? ` ${e.time}` : ""}` : `${md(e.from)}~${md(e.to)} 중`);
  // 범례는 이 달에 실제로 그려진 표시만
  const key = [
    mine.some((e) => e.exact && !e.quiz) && `<span><b class="ex k"></b>확정 시험일</span>`,
    cells.some((c) => c.includes("day period")) && `<span><i class="k-week"></i>시험 주간</span>`,
    mine.some((e) => !e.exact && !inWeek(e)) && `<span><i class="bar k"></i>과목별 시험 기간</span>`,
    mine.some((e) => e.exact && e.quiz) && `<span><b class="ex q k"></b>퀴즈</span>`,
  ].filter(Boolean);
  return `<section class="cal">
    <div class="cal-head">
      <button data-act="cal" data-step="-1" aria-label="이전 달" ${at > 0 ? "" : "disabled"} data-focus="cal-prev">‹</button>
      <h3>${y !== Number(term.start.slice(0, 4)) ? `${y}년 ` : ""}${m}월</h3>
      <button data-act="cal" data-step="1" aria-label="다음 달" ${at < months.length - 1 ? "" : "disabled"} data-focus="cal-next">›</button>
    </div>
    <div class="cal-grid">${[...WD].map((w) => `<div class="wd">${w}</div>`).join("")}${cells.join("")}</div>
    ${key.length ? `<p class="cal-key">${key.join("")}</p>` : ""}
    <ul class="cal-list">${mine.length ? mine.map((e) => `<li><span class="swatch c${colorOf(e.code)}"></span><span class="when">${esc(when(e))}</span>
      <span>${esc(nameOf(e.code))} <span class="muted">${esc(examLabel(e.exam))}</span></span></li>`).join("") : `<li class="muted">이 달 시험 일정 없음</li>`}</ul>
  </section>`;
}
