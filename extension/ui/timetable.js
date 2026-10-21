// 주간 시간표 그리기. 받은 칸만 그리고 상태를 갖지 않는다.
// 칸 종류: blk = 지금 시간표의 과목, opt = 고르는 중인 과목의 같은 시간 분반(누르면 그 분반), pv = 미리보기·다른 시간 선택지(반투명).
// 겹치는 칸은 한 칸에 욱여넣지 않고 줄(lane)을 나눠 나란히 그린다(NUSMods·Coursicle 방식). 겹침 무리마다 따로 나눠, 겹치지 않는 칸은 폭을 다 쓴다.
// 높이는 주어진 칸에 맞춘다(스크롤 없음): 1분 높이 = (전체 높이 - 요일 줄) / 표시 분.
import { DAYS } from "../src/catalog.js";

export const HEAD = 22;
const LINE = 13;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

/** 담은 과목 전체에 맞춘 고정 축: 월~금(+토·일), 정시 단위 */
export function gridRange(slots) {
  const start = Math.min(540, ...slots.map((s) => s.start)), end = Math.max(1080, ...slots.map((s) => s.end));
  const days = [0, 1, 2, 3, 4, ...[5, 6].filter((d) => slots.some((s) => s.day === d))];
  return { days, start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

/**
 * 요일마다 겹치는 칸끼리 무리를 짓고, 무리 안에서 시작 순으로 비어 있는 첫 줄에 넣는다.
 * → 같은 순서의 칸에 {lane, lanes}(몇 번째 줄 / 그 무리의 줄 수)를 붙여 돌려준다. 시간표 칸(blk·opt)이 왼쪽 줄을 먼저 갖는다.
 */
export function lanes(items) {
  const rank = (x) => (x.kind === "pv" ? 1 : 0);
  const order = items.map((x, i) => i).sort((a, b) => items[a].day - items[b].day || items[a].start - items[b].start
    || rank(items[a]) - rank(items[b]) || items[a].end - items[b].end || a - b);
  const out = items.map((x) => ({ ...x }));
  let group = [], ends = [], day = null, groupEnd = -1;
  const close = () => { for (const i of group) out[i].lanes = ends.length; group = []; ends = []; };
  for (const i of order) {
    const x = items[i];
    if (x.day !== day || x.start >= groupEnd) { close(); day = x.day; groupEnd = -1; }
    let lane = ends.findIndex((e) => e <= x.start);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = x.end;
    out[i].lane = lane;
    group.push(i);
    groupEnd = Math.max(groupEnd, x.end);
  }
  close();
  return out;
}

/**
 * @param items [{kind:'blk'|'opt'|'pv', day, start, end, code?, color?, title?, sub?, n?, sel?, on?, label?, clash?, no?, act?, cls?, key?, tip?}]
 * @param {{height:number, showSub:boolean, mark?:{day:number, minute:number}}} opt  mark = 빈 칸 검색으로 누른 자리(가로 줄)
 */
export function timetableHtml(range, items, { height, showSub, mark }) {
  const px = (height - HEAD) / (range.end - range.start);
  const col = (d) => range.days.indexOf(d), w = 100 / range.days.length;
  const pos = (x) => {
    const lw = w / x.lanes;
    return `left:calc(${col(x.day) * w + x.lane * lw}% + 1px);width:calc(${lw}% - 2px);top:${HEAD + (x.start - range.start) * px}px;height:${(x.end - x.start) * px - 1}px`;
  };
  const lines = [];
  for (let m = range.start; m < range.end; m += 60)
    lines.push(`<div class="hr" style="top:${HEAD + (m - range.start) * px}px"><span>${m / 60}</span></div>`);
  const data = (x) => `${x.act ? ` data-act="${x.act}"` : ""}${x.code ? ` data-code="${esc(x.code)}"` : ""}${x.cls ? ` data-cls="${esc(x.cls)}"` : ""}${x.key ? ` data-key="${esc(x.key)}"` : ""}`;
  const tip = (x) => esc(x.tip ?? `${x.title ?? x.label ?? ""} ${DAYS[x.day]} ${hm(x.start)}~${hm(x.end)}`);
  const cell = (x) => {
    if (x.kind === "pv") {
      const cls = `pv c${x.color ?? 9}${x.clash ? " clash" : ""}${x.no ? " no" : ""}`;
      return x.act && !x.no ? `<button class="${cls}" style="${pos(x)}" tabindex="-1"${data(x)} title="${tip(x)}"><span>${esc(x.label)}</span></button>`
        : `<div class="${cls}" style="${pos(x)}" title="${tip(x)}"${x.no ? "" : ' aria-hidden="true"'}><span>${esc(x.label)}</span></div>`;
    }
    const h = (x.end - x.start) * px - 8;                                    // 위아래 여백 뺀 글자 공간
    const title = x.kind === "opt" ? x.cls : x.title;
    const extra = h < LINE * 2 || !showSub || !x.sub ? "" : `<span>${esc(x.sub)}</span>`;
    const n = Math.max(1, Math.floor((h - (extra ? LINE : 0)) / LINE));
    return `<button class="blk${x.kind === "opt" ? " opt" : ""} c${x.color}${x.sel ? " sel" : ""}${x.on ? " on" : ""}" style="${pos(x)}" tabindex="-1"${data(x)} title="${tip(x)}">${
      x.n > 1 ? `<i class="n" aria-label="고를 분반 ${x.n}개">${x.n}</i>` : ""}<b style="-webkit-line-clamp:${n}">${esc(title)}</b>${extra}</button>`;
  };
  return `<div class="tt" role="grid" aria-label="시간표" style="height:${height}px">
    <div class="tt-head" role="row">${range.days.map((d) => `<div role="columnheader">${DAYS[d]}</div>`).join("")}</div>
    <div class="tt-body" data-act="slot" data-days="${range.days.join(",")}" data-start="${range.start}" data-px="${px}">${lines.join("")}
      ${range.days.map((d, i) => `<div class="vl" style="left:${i * w}%"></div>`).join("")}
      ${lanes(items.filter((x) => col(x.day) >= 0)).map(cell).join("")}
      ${mark && col(mark.day) >= 0 ? `<div class="mark" style="left:${col(mark.day) * w}%;width:${w}%;top:${HEAD + (mark.minute - range.start) * px}px" aria-hidden="true"></div>` : ""}
    </div></div>`;
}
