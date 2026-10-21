// 플래너 화면(사이드 패널 = 세로, ?full = 전체보기 3열). 계산은 src/의 순수 함수, 저장은 store.send → background.
import { buildCourses, bundlesOf, blockReason, syllabusUrl, slotKey, fitsAt, DAYS } from "../src/catalog.js";
import { overlap } from "../src/candidates.js";
import { examsOf, examText, examClashes, calendarEvents } from "../src/exams.js";
import { emptyPlan, inputKey, favKey, listing, offOf, pickedOnly, oldCourses, pickIn, codeLines } from "../src/state.js";
import { createNet, pickCatalog, pruneCache } from "../src/net.js";
import { parseRegistrar, makeTerm, kstNow, targetTerm, weekday } from "../src/term.js";
import { analyzeSection } from "../src/syllabus.js";
import { inExtension, getAll, setKeys, send, watch, idbStore } from "./store.js";
import { timetableHtml, gridRange, HEAD } from "./timetable.js";
import { calendarHtml, calMonths } from "./calendar.js";

const FULL = new URLSearchParams(location.search).has("full");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
// 순위 칩: 누를 때마다 1→2→3→1. 저장 값(need/want/spare)과 후보 규칙은 그대로다.
const PRI = { need: "1순위", want: "2순위", spare: "3순위" }, NEXT_PRI = { need: "want", want: "spare", spare: "need" };
// 아이콘(글자 대신): 전체보기 = 바깥으로 펼치는 화살표, 사이드바 = 오른쪽 칸이 있는 창, 후보 생성 = 도는 화살표, 담기 취소 = 휴지통, 상세 닫기 = 왼쪽 화살표
const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  full: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  side: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  gen: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
};
const PRI_HELP = "누를 때마다 순위 변경. 1순위를 가장 많이 넣고, 남는 자리에 2순위, 3순위 순으로 넣음";
const S = {
  plan: emptyPlan(), ana: {}, failed: {}, cands: { M: 0, list: [] }, reasons: {}, inAny: new Set(),
  local: { detail: null, query: "", toast: null, favPicks: {}, maxError: "", pop: null, hover: null, choose: null, slot: null, gone: null }, jobId: 0,
};

const blocked = () => (S.schedule?.windows ?? []).some(([a, b]) => a <= kstNow() && kstNow() <= b);

async function boot() {
  document.body.classList.toggle("full", FULL);
  let rows = [];
  if (inExtension) {
    await linkSurfaces();
    const t = targetTerm(kstNow());
    S.termId = `${t.year}-${t.code}`;
    const store = idbStore();
    S.net = createNet({ fetch: (...a) => fetch(...a), store });
    try { await setKeys({ schedule: { windows: await S.net.loadSchedule(), at: Date.now() }, term: S.termId }); }
    catch { await setKeys({ term: S.termId }); }
    const pick = await pickCatalog(S.net, t);
    rows = pick.rows;
    S.lastYear = pick.lastYear;
    const year = pick.year;
    S.dataId = `${year}-${t.code}`;
    await setKeys({ dataTerm: S.dataId });   // 과목조회 화면이 다른 학기 목록이면 별을 누를 때 알려 주려고
    // 지난 학기 캐시 정리: 학교 응답은 지금 두 학기 것만, 판정 결과는 지금 목록 학기 것만 남긴다(저장본은 자기 사본이 있음).
    // 목록을 실제로 받았을 때만(신청 기간에 막혔거나 못 받았으면 어느 학기가 맞는지 모르므로 지우지 않음)
    if (pick.rows.length) {
      pruneCache(store, [`${t.year}${t.code}`, `${year}${t.code}`]).catch(() => {});
      getAll().then((all) => chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith("ana:") && !k.startsWith(`ana:${S.dataId}:`)))).catch(() => {});
    }
    try { S.term = await loadTerm(year, t.code); } catch { S.term = null; }
  } else {
    // 확장 밖 미리보기: 개발용 카탈로그(2026-2)만 쓴다. 학교 서버에 요청하지 않는다.
    S.termId = S.dataId = "2026-2R";
    // devdata는 저장소에 없다. 없는 기기에서도 화면은 뜨게 빈 목록으로 시작한다.
    rows = await fetch("../../devdata/catalog_2026_2R.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    S.term = makeTerm({ year: 2026, code: "2R", start: "2026-09-01", midterm: ["2026-10-20", "2026-10-26"], final: ["2026-12-14", "2026-12-18"] });
  }
  S.courses = buildCourses(rows);
  S.loaded = true;
  watch(refresh);
  await refresh();
}

/**
 * 사이드 패널과 전체보기는 한 화면처럼: 같은 창에서 한쪽이 열리면 다른 쪽은 닫힌다.
 * 열릴 때 알리고, 같은 창의 반대쪽 알림을 받으면 스스로 닫는다(패널은 window.close, 전체보기는 자기 탭 닫기).
 */
async function linkSurfaces() {
  S.win = (await chrome.windows.getCurrent()).id;
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type !== "surface" || m.win !== S.win || m.full === FULL) return;
    if (FULL) chrome.tabs.getCurrent().then((t) => t && chrome.tabs.remove(t.id));
    else window.close();
  });
  chrome.runtime.sendMessage({ type: "surface", win: S.win, full: FULL }).catch(() => {});
}

/** 전체보기: 지금 보던 탭 바로 옆에 열고(닫으면 그 탭으로 돌아감), 패널은 알림을 받고 닫힌다 */
async function openFull() {
  const [cur] = await chrome.tabs.query({ active: true, windowId: S.win });
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/panel.html?full"), windowId: S.win, ...(cur && { index: cur.index + 1, openerTabId: cur.id }) });
}

/** 학사일정: 현재 학기 화면에 없으면 그 화면의 학기선택 목록에서 해당 학기를 골라 한 번 더 읽는다. 없으면 null. */
async function loadTerm(year, code) {
  const html = await S.net.registrarHtml();
  const here = parseRegistrar(html, year, code);
  if (here) return here;
  const id = html.match(new RegExp(`<option value="(\\d+)"[^>]*data-term="${code[0]}" data-year="${year}"`))?.[1];
  return id ? parseRegistrar(await S.net.registrarHtml(`?cYear=${year}&hakGi=${code[0]}&srCategoryId1=${id}`), year, code) : null;
}

async function refresh() {
  const all = await getAll();
  S.plan = all[`plan:${S.termId}`] ?? emptyPlan();
  S.schedule = all.schedule;
  const pre = `ana:${S.dataId}:`;
  S.ana = Object.fromEntries(Object.entries(all).filter(([k, v]) => k.startsWith(pre) && v?.v === ANA_V).map(([k, v]) => [k.slice(pre.length), v]));
  // 후보는 '후보 생성'을 눌러야 다시 만든다(창을 처음 열 때, 다른 창에서 생성했을 때만 자동). 담기·순위·한도를 바꾸면 버튼만 켜진다.
  const ik = inputKey(S.plan);
  if (S.genKey === undefined || (S.plan.gen === ik && S.genKey !== ik)) recompute();
  S.dirty = ik !== S.genKey;
  render();
  collect();
}

// ── 후보 계산(워커) ──
function recompute() {
  const input = [];
  S.reasons = {};
  S.genKey = inputKey(S.plan);
  S.genCodes = new Set(Object.keys(S.plan.courses));
  S.dirty = false;
  for (const [code, c] of Object.entries(S.plan.courses)) {
    const course = S.courses.get(code);
    const off = course && offOfCourse(c, course);
    const why = course ? blockReason(course, off) : missingText();
    if (why) { S.reasons[code] = why === "모든 분반 제외" && pickedOnly(c, S.dataId) ? `고른 분반(${c.only.join("·")})이 ${termName(S.dataId)} 목록에 없음` : why; continue; }
    input.push({ code, name: course.name, pri: c.pri, credit: course.credit, bundles: bundlesOf(course, off) });
  }
  if (S.busy) { S.worker.terminate(); S.worker = null; }          // 새 입력이 오면 이전 계산은 버린다
  S.worker ??= new Worker(new URL("./candidate-worker.js", import.meta.url), { type: "module" });
  const id = ++S.jobId;
  S.busy = true;
  S.worker.onmessage = ({ data }) => {
    if (data.id !== S.jobId) return;
    S.busy = false;
    const prev = S.plan.view.autoKey;
    S.cands = data;
    S.inAny = new Set(data.list.flatMap((c) => c.picks.map((p) => p.code)));
    S.local.changed = Boolean(prev && S.plan.view.mode === "auto" && data.list.length && !data.list.some((c) => c.key === prev));
    render();
  };
  S.worker.onerror = (e) => { S.busy = false; toast(`계산 오류: ${e.message}`); };
  S.worker.postMessage({ id, courses: input, maxCredit: S.plan.maxCredit });
  render();
}

/** 플래너가 쓰는 과목 목록(작년판이면 작년 같은 학기)에 없는 과목: 무엇과 비교했는지와 할 일을 적는다 */
const termName = (id) => `${id.slice(0, 4)}-${id[5]}학기`;
const missingText = (short = false) => short ? `${S.lastYear ? "작년 " : ""}${S.dataId[5]}학기 목록에 없음`
  : S.lastYear ? `작년(${termName(S.dataId)}) 목록에 없음 · 과목조회 ${S.dataId[5]}학기에서 담기`
  : `${termName(S.dataId)} 목록에 없음 · 과목조회 학기 확인`;

/** 후보에서 뺄 분반(과목조회에서 고른 분반 밖 + 상세에서 뺀 분반) */
const offOfCourse = (c, course) => offOf(c, course.sections.map((s) => s.cls), S.dataId);

// ── 계획서 수집(확장 페이지에서만, 페이지끼리 잠금으로 하나씩) ──
// 판정 결과 형식 버전: 퀴즈·대체·과제 마감이 없는 예전 결과(v 없음)는 다시 판정한다(학교 응답은 캐시에서).
const ANA_V = 2;
let pdfjs;
async function collect() {
  if (!inExtension || S.collecting || !S.term || blocked()) return;
  S.collecting = true;
  const tried = new Set();
  let stopped = false;
  try {
    await navigator.locks.request("school-net", async () => {
      for (const { code, s } of todo()) {
        const key = `ana:${S.dataId}:${code}-${s.cls}`;
        tried.add(`${code}-${s.cls}`);
        if ((await chrome.storage.local.get(key))[key]?.v === ANA_V) continue;   // 다른 창이 이미 읽음
        pdfjs ??= await import("../vendor/pdfjs/pdf.min.mjs").then((m) => { m.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs"); return m; });
        const r = await analyzeSection(s.row, { net: S.net, term: S.term, pdfjs });
        const why = r.result[0]?.why ?? "";
        if (/수강신청 기간/.test(why)) { stopped = true; break; }
        if (r.result.length === 1 && why.startsWith("수집 실패")) { S.failed[`${code}-${s.cls}`] = why; render(); continue; }
        await setKeys({ [key]: { v: ANA_V, at: Date.now(), result: r.result.map(({ exam, state, date, time, why: w, evidence }) => ({ exam, state, date, time, why: w, ev: evidence?.[0]?.slice(0, 120) })),
          alt: r.alt, tasks: r.tasks, quiz: r.quiz.map(({ date, week, text }) => ({ date, week, text: text.slice(0, 60) })) } });
      }
    });
  } finally { S.collecting = false; }
  // 읽는 동안 새로 담은 과목은 이번 차례에 없었다: 남은 것이 있으면 바로 이어서 읽는다(다시 열 필요 없음)
  if (!stopped && [...todo()].some(({ code, s }) => !tried.has(`${code}-${s.cls}`))) collect();
}
function* todo() {
  const codes = [...S.plan.bar, ...Object.keys(S.plan.courses).filter((c) => !S.plan.bar.includes(c))];
  for (const code of codes) for (const s of S.courses.get(code)?.sections ?? []) {
    const only = pickedOnly(S.plan.courses[code], S.dataId);
    if (only && !only.includes(s.cls)) continue;   // 과목조회에서 고르지 않은 분반은 읽지 않음(요청 최소화)
    if (!S.ana[`${code}-${s.cls}`] && !S.failed[`${code}-${s.cls}`]) yield { code, s };
  }
}
const anaOf = (code) => (cls) => S.ana[`${code}-${cls}`] ?? (S.failed[`${code}-${cls}`] ? { failed: S.failed[`${code}-${cls}`] } : undefined);

// ── 화면 모델: 자동 후보와 저장본을 같은 모양으로 ──
const sectionInfo = (s) => ({ cls: s.cls, profs: s.profs, note: s.note, url: syllabusUrl(s.row) });

function view() {
  const p = S.plan;
  if (p.view.mode === "fav") {
    const favs = p.favorites;
    if (!favs.length) return { n: 0, empty: "저장한 시간표 없음" };
    const i = Math.max(0, favs.findIndex((f) => f.key === p.view.favKey)), f = favs[i];
    const tmp = S.local.favPicks[f.key];
    const picks = Object.fromEntries(f.courses.filter((c) => c.pick && c.bundle.cls.length > 1).map((c) => [c.code, c.pick]));   // 분반 하나짜리는 고른 게 아님
    const cur = { ...picks, ...(tmp ?? {}) };
    for (const k of Object.keys(cur)) if (!cur[k]) delete cur[k];
    return { i, n: favs.length, fav: f, candKey: f.candKey, key: favKey(f.candKey, cur), credits: f.credits, order: f.order,
      courses: f.courses.map((c) => ({ ...c, pick: pickIn(c.bundle.cls, cur[c.code]), ana: (cls) => c.exams[cls] ?? { failed: "저장 당시 미확인" } })) };
  }
  const list = S.cands.list;
  if (!list.length) return { n: 0, empty: Object.keys(p.courses).length ? (S.busy ? "" : S.dirty ? "↻ 후보 생성을 누르면 후보를 만듦" : "가능한 후보 없음") : "" };
  const i = Math.max(0, list.findIndex((c) => c.key === p.view.autoKey)), c = list[i];
  const picks = p.picks[c.key] ?? {};
  return { i, n: list.length, candKey: c.key, key: favKey(c.key, picks), credits: c.credits,
    courses: c.picks.map((x) => ({ code: x.code, name: x.name, credit: x.credit, color: p.courses[x.code]?.color ?? 0, bundle: x.bundle,
      sections: S.courses.get(x.code).sections.filter((s) => x.bundle.cls.includes(s.cls)).map(sectionInfo),
      pick: pickIn(x.bundle.cls, picks[x.code]), ana: anaOf(x.code) })) };
}
const usedCls = (c) => (c.pick ? [c.pick] : c.bundle.cls);
const profText = (c) => (c.pick ? c.sections.find((s) => s.cls === c.pick)?.profs.join(", ") : c.sections.map((s) => s.profs.join(", ")).join(" / ")) ?? "";

// ── 그리기 ──
function render() {
  if (!S.loaded) return;
  const focus = document.activeElement?.dataset?.focus;
  const v = view();
  const exByCode = new Map((v.courses ?? []).map((c) => [c.code, examsOf(usedCls(c), c.ana)]));
  const clashes = examClashes(exByCode);
  document.getElementById("app").innerHTML = FULL
    ? `${headHtml(v)}<div class="cols"><div class="col">${gridHtml(v)}</div><div class="col">${listHtml(v, exByCode, clashes)}</div><div class="col">${examPanelHtml(v, exByCode)}</div></div>${footHtml()}`
    : `${headHtml(v)}${gridHtml(v)}${listHtml(v, exByCode, clashes)}${footHtml()}`;
  const f = focus && document.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
  if (f) { f.focus(); if (f.tagName === "INPUT" && f.type !== "checkbox") f.selectionStart = f.selectionEnd = f.value.length; }
  if (!FULL && !S.fitting && fitGrid()) { S.fitting = true; render(); S.fitting = false; }
}

/**
 * 사이드 패널은 페이지 스크롤 없이 한 화면: 그린 뒤 실제 높이를 재서, 목록 칸이 4줄(LIST_MIN) 남도록 시간표 높이를 맞춘다.
 * 스크롤은 목록(검색 결과·상세 포함) 안에서만 생긴다. 다시 그려야 하면 true.
 */
const LIST_MIN = 124;
function fitGrid() {
  const app = document.getElementById("app"), tt = app.querySelector(".tt"), area = app.querySelector(".courses, .results, .detail, .list > .empty");
  if (!tt || !area) return false;
  // 상세·검색을 여닫을 때 시간표 크기가 출렁이지 않게, 크기는 기본 목록 화면에서만 정한다(넘칠 때만 줄임)
  const over = app.scrollHeight - app.clientHeight;
  if ((S.local.detail || S.local.query.trim() || S.local.slot) && S.gridH && over <= 0) return false;
  const want = Math.min(640, Math.max(200, tt.offsetHeight + area.offsetHeight - LIST_MIN - over));
  if (Math.abs(want - tt.offsetHeight) < 2) return false;
  S.gridH = want;
  return true;
}

// [짧은 표시, 설명]. 패널은 학기 옆 작은 표시(설명은 마우스·보조기술), 전체보기는 설명 줄까지.
// [짧은 표시, 설명, (누르면 할 일)]
// 이전 학기 목록으로 연습한 과목: 새 학기 목록이 나왔으면 '옮기기'(학수번호는 남기고 분반 초기화), 아직 작년 목록인데 신청 기간이면 '지우기' 경고
const oldInPlan = () => (!S.lastYear || blocked() ? oldCourses(S.plan, S.termId) : []);
const rebaseKeep = () => oldInPlan().filter((c) => S.courses.get(c));
const termNotes = () => [
  blocked() && ["신청 기간", "수강신청 기간: 학교 서버에 접속하지 않고 저장된 정보로 보는 중"],
  oldInPlan().length && !S.lastYear && [`새 학기로 옮기기 ${oldInPlan().length}`, `${termName(S.termId)} 과목 목록이 나왔음: 이전 학기 목록으로 담은 과목 ${oldInPlan().length}개를 옮김 · 새 목록에 있는 ${rebaseKeep().length}개는 학수번호만 남기고 분반 선택을 초기화, 없는 ${oldInPlan().length - rebaseKeep().length}개는 뺌(되돌리기 가능)`, "rebase"],
  oldInPlan().length && S.lastYear && [`이전 학기 ${oldInPlan().length}개 지우기`, `신청 기간: 이전 학기 정보로 담은 과목 ${oldInPlan().length}개(${oldInPlan().map(courseName).join(", ")})는 실제 개설·시간과 다를 수 있음`, "clearOld"],
  S.lastYear && ["작년", `${S.termId.slice(0, 6)}학기 과목 정보가 아직 없어 작년 정보로 보는 중`],
  inExtension && !S.term && ["시험 판정 안 함", "학사일정을 읽지 못해 시험 날짜를 판정하지 않음"],
  !inExtension && ["미리보기", "미리보기: 개발용 2026-2 과목 목록, 학교 서버 요청 없음"],
].filter(Boolean);

function headHtml(v) {
  const fav = S.plan.view.mode === "fav", notes = termNotes();
  return `<header class="top">
    <span class="term">${esc(S.termId.slice(0, 6))}${notes.map(([s, l, act]) => act ? ` <button class="chip act" data-act="${act}" title="${esc(l)}">${esc(s)}</button>` : ` <span class="chip" title="${esc(l)}" aria-label="${esc(l)}">${esc(s)}</span>`).join("")}</span>
    <button class="pill" data-act="mode" data-mode="${fav ? "auto" : "fav"}" aria-pressed="${fav}" data-focus="mode"
      title="${fav ? "저장한 시간표만 보는 중 · 누르면 전체 후보" : "누르면 저장한 시간표만 보기"}" aria-label="저장한 시간표만 보기">저장 ${S.plan.favorites.length}</button>
    <label class="credit"><span>${v.n ? v.credits : 0}</span> / <input id="max" inputmode="decimal" value="${S.plan.maxCredit}" aria-label="최대 학점" data-focus="max">학점</label>
    ${S.local.maxError ? `<span class="err">${esc(S.local.maxError)}</span>` : ""}
    ${!FULL ? `<button class="icon" data-act="full" title="전체보기" aria-label="전체보기">${ICON.full}</button>`
      : inExtension && chrome.sidePanel?.open ? `<button class="icon" data-act="side" title="사이드바로" aria-label="사이드바로">${ICON.side}</button>` : ""}
  </header>${FULL ? bannerNotes(notes).map(([s, l, act]) => `<p class="banner">${esc(l)}${act ? ` <button class="link" data-act="${act}">${esc(s.replace(/ \d+개?/, ""))}</button>` : ""}</p>`).join("") : ""}`;
}
// 전체보기 설명 줄은 하나만: 누를 일이 있는 것 먼저, 없으면 첫 번째. 나머지는 머리줄 알약의 title로 본다.
const bannerNotes = (notes) => [notes.find((n) => n[2]) ?? notes[0]].filter(Boolean);

/** 시간표 높이: 스크롤 없이 전체가 보이게 창 높이에 맞춘다(패널은 첫 추정값을 fitGrid가 실측으로 고친다). */
const gridHeight = (extra) => (FULL ? Math.min(900, Math.max(360, innerHeight - 120 - 36 * bannerNotes(termNotes()).length))
  : S.gridH ?? Math.min(640, Math.max(200, innerHeight - 244 - extra)));

function gridHtml(v) {
  const p = S.plan;
  const allSlots = [...Object.keys(p.courses).flatMap((code) => (S.courses.get(code)?.sections ?? []).flatMap((s) => s.time.slots)),
    ...(v.courses ?? []).flatMap((c) => c.bundle.slots)];
  const ch = v.courses?.some((c) => c.code === S.local.choose) ? S.local.choose : null;
  // 반투명 칸: 고르는 중이면 그 과목의 다른 시간, 아니면 마우스를 올린 과목(없으면 상세를 연 과목)의 묶음. 지금 시간표에 든 묶음은 빼고.
  const pv = ch ?? S.local.hover ?? S.local.detail;
  const pc = pv && S.courses.get(pv);
  const range = gridRange([...allSlots, ...(pc?.sections ?? []).flatMap((s) => s.time.slots)]);
  // 시간표 칸. 같은 시간 분반이 여럿이고 아직 안 골랐으면 오른쪽 위에 고를 분반 수. 고르는 중인 과목은 분반마다 줄을 나눠 그린다(누르면 그 분반).
  const blocks = (v.courses ?? []).flatMap((c) => c.code === ch && c.bundle.cls.length > 1
    ? c.bundle.slots.flatMap((s) => c.sections.map((x) => ({ kind: "opt", ...s, code: c.code, color: c.color, cls: x.cls, sub: x.profs.join(", "),
      on: c.pick === x.cls, act: "pick", tip: `${c.name} ${x.cls}분반 ${x.profs.join(", ")} · ${c.pick === x.cls ? "고른 분반" : "누르면 이 분반"}` })))
    : c.bundle.slots.map((s) => ({ kind: "blk", ...s, code: c.code, title: c.name, sub: profText(c), color: c.color, sel: c.code === ch, act: "choose",
      n: !c.pick && c.bundle.cls.length > 1 ? c.bundle.cls.length : 0,
      tip: `${c.name} ${DAYS[s.day]} ${hm(s.start)}~${hm(s.end)} ${profText(c)} · 누르면 다른 분반·시간 보기` })));
  const own = v.courses?.find((c) => c.code === pv)?.bundle.key;
  const others = blocks.filter((b) => b.code !== pv);
  const auto = p.view.mode === "auto" && p.courses[pv];
  const previews = pc ? bundlesOf(pc, p.courses[pv] ? offOfCourse(p.courses[pv], pc) : []).filter((b) => b.key !== own).flatMap((b) => {
    const no = ch && auto && !S.cands.list.some((c) => c.picks.some((x) => x.code === pv && x.bundle.key === b.key));
    return b.slots.map((s) => ({ kind: "pv", ...s, code: pv, key: b.key, color: p.courses[pv]?.color ?? 9, no,
      label: `${pv === S.local.hover && !own ? `${pc.name} ` : ""}${b.cls.join("·")}분반`, clash: others.some((o) => overlap([o], [s])),
      act: ch && auto ? "goTime" : null,
      tip: `${pc.name} ${b.cls.join("·")}분반 ${DAYS[s.day]} ${hm(s.start)}~${hm(s.end)}${no ? " · 이 시간이 든 후보 없음(겹침·학점)" : ch && auto ? " · 누르면 이 시간 후보로" : ""}` }));
  }) : [];
  const none = (v.courses ?? []).filter((c) => !c.bundle.slots.length).map((c) => c.name);
  const isSaved = S.plan.favorites.some((f) => f.key === v.key);
  const status = [
    S.busy && "계산 중…",
    v.courses?.some((c) => oldInPlan().includes(c.code)) && "이전 학기 과목 포함",
    S.local.changed && "후보 변경됨",
    v.fav && `저장본 · ${kstNow(v.fav.savedAt).slice(5, 10).replace(/^0?(\d+)-0?/, "$1/")}${v.credits > p.maxCredit ? ` · 한도 ${v.credits - p.maxCredit}학점 초과` : ""}`,
  ].filter(Boolean).join(" · ");
  return `<section class="grid-wrap">
    ${v.n || previews.length ? timetableHtml(range, [...blocks, ...previews], { height: gridHeight((p.bar.length ? 72 : 0) + (none.length ? 18 : 0)), showSub: FULL, mark: S.local.slot }) : ""}
    ${v.n ? "" : `<div class="empty">${esc(v.empty || (Object.keys(p.courses).length ? "" : "학교 과목조회에서 ☆로 과목을 담으세요"))}</div>`}
    ${none.length ? `<p class="note">시간 없음: ${esc(none.join(", "))}</p>` : ""}
    <div class="nav">
      ${status ? `<span class="status" role="status">${esc(status)}</span>` : ""}
      <span class="nav-r">
        ${p.view.mode === "auto" ? `<button class="gen${S.dirty ? " on" : ""}" data-act="gen" title="${S.dirty ? "바뀐 조건으로 후보 생성" : "후보 다시 생성"}" aria-label="후보 생성" ${S.busy ? "disabled" : ""} data-focus="gen">${ICON.gen}</button>` : ""}
        <button class="copy" data-act="copy" title="학수번호·분반 목록 복사(수강신청 화면에 붙여 넣기)" aria-label="학수번호 목록 복사" ${v.n ? "" : "disabled"} data-focus="copy">${ICON.copy}</button>
        <button class="heart" data-act="heart" aria-pressed="${isSaved}" title="${isSaved ? "저장 해제" : "이 시간표 저장"}" aria-label="${isSaved ? "저장 해제" : "이 시간표 저장"}" ${v.n && !S.busy ? "" : "disabled"} data-focus="heart">${isSaved ? "♥" : "♡"}</button>
        <span class="pager">
          <button data-act="prev" aria-label="이전 ${p.view.mode === "fav" ? "저장본" : "후보"}" ${v.n > 1 ? "" : "disabled"} data-focus="prev">‹</button>
          <span class="count">${v.n ? `${v.i + 1}/${v.n}` : "0/0"}</span>
          <button data-act="next" aria-label="다음 ${p.view.mode === "fav" ? "저장본" : "후보"}" ${v.n > 1 ? "" : "disabled"} data-focus="next">›</button>
        </span>
      </span>
    </div>
  </section>`;
}

/** short: 사이드 패널 한 줄용(중/기, 작년 표시는 머리줄 표시로 대신) */
function examLine(code, ex, clash, short = false) {
  if (!inExtension) return `<span class="muted">${short ? "시험 판정 없음" : "미리보기: 시험 판정 없음"}</span>`;
  if (!S.term) return `<span class="muted">시험 정보 없음</span>`;
  if (ex.failed) return `<span class="warn">읽기 실패</span> <button class="link" data-act="retry" data-code="${esc(code)}">다시</button>`;
  if (ex.pending) return `<span class="muted">${blocked() ? (short ? "시험: 신청 기간 뒤 확인" : "신청 기간이라 시험 정보를 새로 읽지 않음 · 기간 뒤 자동 확인") : "시험 확인 중"}</span>`;
  const parts = ex.items.map((x) => examText(x, short)).map((t) => `<span class="${t.tone}">${S.lastYear && !short ? "작년 " : ""}${esc(t.text)}</span>`);
  for (const c of clash ?? []) parts.push(`<span class="bad">${short ? "겹침" : "시험 겹침"} ${+c.date.slice(5, 7)}/${+c.date.slice(8)}${short ? "" : ` ${esc(courseName(c.other))}`}</span>`);
  return parts.join(" · ") || `<span class="muted">시험 정보 없음</span>`;
}
const courseName = (code) => S.courses.get(code)?.name ?? view().courses?.find((c) => c.code === code)?.name ?? code;

function listHtml(v, exByCode, clashes) {
  if (S.local.detail) return detailHtml(S.local.detail, v);
  const p = S.plan;
  const inView = new Set((v.courses ?? []).map((c) => c.code));
  const L = listing(p, inView, v.fav ? v.order.filter((c) => inView.has(c)) : null);
  // 사이드 패널: 한 줄(과목명 · 시험), 순위 칩은 새로 담은 과목에만. 전체보기: 두 줄 + 모든 과목 순위 칩.
  const row = (code, inBar = false) => {
    const saved = v.courses?.find((c) => c.code === code);
    const live = S.courses.get(code), mine = p.courses[code];
    const name = live?.name ?? saved?.name ?? code, color = mine?.color ?? saved?.color ?? 0;
    const ex = exByCode.get(code) ?? (live ? examsOf(live.sections.filter((s) => !offOfCourse(mine, live).includes(s.cls)).map((s) => s.cls), anaOf(code)) : { pending: false, items: [] });
    const stalePick = mine?.only && !pickedOnly(mine, S.dataId) ? `${termName(mine.onlyFrom)} 목록에서 고른 ${mine.only.join("·")}분반은 쓰지 않음(학기가 다르면 다른 수업) · 모든 분반으로 계산` : null;
    const reason = (!live && mine ? missingText() : S.reasons[code]) ?? stalePick ?? (mine && S.genCodes?.has(code) && p.view.mode === "auto" && !S.busy && S.cands.list.length && !S.inAny.has(code) ? "현재 조건에서 후보 없음" : null);
    const short = !FULL;
    const pri = mine && (FULL || inBar) ? `<button class="rank r-${mine.pri}" data-act="pri" data-code="${esc(code)}" title="${PRI_HELP}"
      aria-label="${esc(name)} ${PRI[mine.pri]}. ${PRI_HELP}" data-focus="pri-${esc(code)}">${PRI[mine.pri]}</button>` : "";
    const exam = (reason && short) || (!live && mine) ? "" : examLine(code, ex, clashes.get(code), short);
    const sub = `${reason ? `<span class="warn" title="${esc(reason)}">${esc(short ? (reason === "현재 조건에서 후보 없음" ? "후보 없음" : reason === missingText() ? missingText(true) : reason) : reason)}</span>${exam ? " · " : ""}` : ""}${exam}${mine ? "" : ` <span class="muted">저장된 과목</span>`}`;
    return `<li class="row${inView.has(code) ? " in" : ""}${short && !inBar ? " one" : ""}" data-hover="${esc(code)}">
      <span class="swatch c${color}" aria-hidden="true"></span>
      <div class="main">
        <button class="name" data-act="detail" data-code="${esc(code)}" data-focus="name-${esc(code)}">${esc(name)}</button>
        <div class="sub">${sub}</div>
      </div>${pri}
    </li>`;
  };
  const q = S.local.query.trim();
  return `<section class="list">
    ${L.bar.length ? `<h2>새로 담음</h2><ul class="bar">${row(L.bar[0], true)}</ul>` : ""}
    <input id="q" type="search" placeholder="과목명·학수번호" value="${esc(S.local.query)}" aria-label="과목 검색" data-focus="q">
    ${FULL && !q && Object.keys(p.courses).length ? `<div class="tools"><button class="ghost" data-act="clearAll" title="담은 과목과 후보를 모두 지움(되돌리기 가능)">${ICON.trash} 모두 비우기</button></div>` : ""}
    ${q || S.local.slot ? searchHtml(q, v) : `<ul class="courses">${goneHtml()}${[...L.included, ...L.excluded].map((c) => row(c)).join("")}</ul>`}
  </section>`;
}

/** 지운 과목 자리의 '뺌 · 되돌리기' 줄(NUSMods tombstone). 다른 과목을 담거나 빼면 사라진다. */
const goneHtml = () => (S.local.gone && !S.plan.courses[S.local.gone.code] ? `<li class="row gone"><span class="swatch" aria-hidden="true"></span>
  <div class="main">${esc(S.local.gone.name)} <span class="muted">뺌</span></div><button class="link" data-act="undoGone" data-focus="undoGone">되돌리기</button></li>` : "");

/**
 * 검색 결과. 시간표 빈 칸을 눌렀으면(S.local.slot) 그 요일·시각에 수업이 있고 지금 시간표의 다른 과목과 겹치지 않는 분반이 있는 과목만(SNUTT 시간대 검색).
 * 글자 검색과 함께 걸린다.
 */
function searchHtml(q, v) {
  const n = q.trim().normalize("NFC").toLowerCase(), slot = S.local.slot;
  const busy = slot ? (v.courses ?? []).flatMap((c) => c.bundle.slots.map((x) => ({ ...x, code: c.code }))) : [];
  const all = [...S.courses.values()].filter((c) => !n || c.name.toLowerCase().includes(n) || c.code.toLowerCase().includes(n))
    .map((c) => ({ c, fit: slot ? fitsAt(c, slot.day, slot.minute, busy.filter((b) => b.code !== c.code), S.plan.courses[c.code] ? offOfCourse(S.plan.courses[c.code], c) : []) : null }))
    .filter((x) => !slot || x.fit.length);
  const head = slot ? `<div class="slotbar"><button class="chip act" data-act="slotClear" data-focus="slotClear" title="빈 시간 조건 해제" aria-label="${DAYS[slot.day]} ${hm(slot.minute)} 빈 시간 조건 해제">${DAYS[slot.day]} ${hm(slot.minute)} 빈 시간 ✕</button>
    <span class="muted">${all.length}과목${all.length > 40 ? " · 앞 40개" : ""}</span></div>` : "";
  if (!all.length) return `${head}<p class="empty">${slot ? "그 시간에 겹치지 않고 들을 수 있는 과목 없음" : "찾는 과목이 없음"}</p>`;
  return `${head}<ul class="results">${all.slice(0, 40).map(({ c, fit }) => {
    const on = Boolean(S.plan.courses[c.code]);
    const t = (fit ? c.sections.find((x) => x.cls === fit[0]) : c.sections[0])?.row.TIME_ROOM ?? "";   // 빈 시간 검색이면 들어가는 분반의 시간
    return `<li data-hover="${esc(c.code)}"><div class="main"><b>${esc(c.name)}</b><div class="sub">${esc(c.code)} · ${fit ? `${esc(fit.join("·"))}분반 가능` : `분반 ${c.sections.length}`} · ${esc(String(t).replace(/<br\s*\/?>/gi, " "))}</div></div>
      <button class="star${S.local.pop === c.code ? " pop" : ""}" data-act="${on ? "remove" : "add"}" data-code="${esc(c.code)}" aria-pressed="${on}" aria-label="${esc(c.name)} ${on ? "담기 취소" : "담기"}" data-focus="star-${esc(c.code)}">${on ? "★" : "☆"}</button></li>`;
  }).join("")}</ul>`;
}

function detailHtml(code, v) {
  const live = S.courses.get(code), mine = S.plan.courses[code];
  const inView = v.courses?.find((c) => c.code === code);
  const name = live?.name ?? inView?.name ?? code;
  const ana = inView && v.fav ? inView.ana : anaOf(code);
  const groups = new Map();
  for (const s of live?.sections ?? []) {
    const k = s.time.state === "unknown" ? "?" : slotKey(s.time.slots);
    if (!groups.has(k)) groups.set(k, { time: s.time, rows: [] });
    groups.get(k).rows.push(s);
  }
  const timeLabel = (t) => (t.state === "unknown" ? "시간 확인 필요" : t.state === "none" ? "시간 없음" :
    t.slots.map((s) => `${DAYS[s.day]} ${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, "0")}~${Math.floor(s.end / 60)}:${String(s.end % 60).padStart(2, "0")}`).join(", "));
  const pickable = inView && inView.bundle.cls.length > 1;
  return `<section class="detail" aria-label="${esc(name)} 상세">
    <header><button class="icon back" data-act="close" title="뒤로" aria-label="뒤로" data-focus="close">${ICON.back}</button><h2>${esc(name)} <small>${esc(code)} · ${live?.credit ?? inView?.credit ?? "?"}학점</small></h2></header>
    ${[...groups].map(([k, g]) => `<div class="grp${inView?.bundle.key === k ? " cur" : ""}"><h3>${esc(timeLabel(g.time))}${inView?.bundle.key === k ? " · 현재 후보" : jumpHtml(code, k, v)}</h3><ul>
      ${g.rows.map((s) => {
        const sel = pickable && inView.bundle.cls.includes(s.cls);
        const off = offOfCourse(mine, live).includes(s.cls);
        const ex = examsOf([s.cls], ana);
        return `<li class="sec${off ? " off" : ""}">
          ${sel ? `<button class="pick" data-act="pick" data-code="${esc(code)}" data-cls="${esc(s.cls)}" aria-pressed="${inView.pick === s.cls}" aria-label="${esc(s.cls)}분반 고르기" data-focus="pick-${esc(s.cls)}">${inView.pick === s.cls ? "●" : "○"}</button>` : `<span class="pick"></span>`}
          <div class="main"><b>${esc(s.cls)}</b> ${esc(s.profs.join(", "))}
            <div class="sub">${examLine(code, ex, null)}${ex.items.filter((x) => x.state === "!" || x.state === "예상").map((x) => ` <span class="why">${esc(x.why ?? "")}</span>`).join("")}</div>
            ${extrasHtml(ana(s.cls))}
            ${s.note ? `<div class="sub note">${esc(s.note)}</div>` : ""}</div>
          ${mine ? `<label class="incl"><input type="checkbox" data-act="incl" data-code="${esc(code)}" data-cls="${esc(s.cls)}" ${off ? "" : "checked"} data-focus="incl-${esc(s.cls)}">포함</label>` : ""}
          ${blocked() ? "" : `<a class="link" href="${esc(syllabusUrl(s.row))}" target="_blank" rel="noopener">원문↗</a>`}
        </li>`;
      }).join("")}</ul></div>`).join("")}
    ${mine ? `<button class="danger icon" data-act="remove" data-code="${esc(code)}" title="담기 취소" aria-label="${esc(name)} 담기 취소" data-focus="remove">${ICON.trash}</button>` : ""}
  </section>`;
}

/** 상세의 퀴즈·과제 마감 줄(분반별). 작년 계획서면 그렇다고 적는다. */
function extrasHtml(a) {
  if (!a?.result) return "";
  const day = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}(${"월화수목금토일"[weekday(d)]})`;
  const pre = S.lastYear ? "작년 정보 기반 · " : "";
  const quiz = (a.quiz ?? []).map((q) => (q.date ? day(q.date) : q.week ? `${q.week}주차` : "날짜 미기재"));
  const tasks = (a.tasks ?? []).map((t) => `${day(t.date)}${t.name ? ` ${t.name}` : ""}`);
  return `${quiz.length ? `<div class="sub extra">${esc(`${pre}퀴즈 ${quiz.join(", ")}`)}</div>` : ""}${
    tasks.length ? `<div class="sub extra">${esc(`${pre}과제 마감 ${tasks.join(", ")}`)}</div>` : ""}`;
}

/** 상세의 다른 시간 묶음: 그 시간이 든 후보로 가는 버튼(지금 후보와 가장 비슷한 것). 그런 후보가 없으면 이유만 */
function jumpHtml(code, key, v) {
  if (S.plan.view.mode !== "auto" || !S.plan.courses[code] || !S.cands.list.length) return "";
  const has = S.cands.list.some((c) => c.picks.some((x) => x.code === code && x.bundle.key === key));
  return has ? ` <button class="link" data-act="goTime" data-code="${esc(code)}" data-key="${esc(key)}">이 시간 후보 보기</button>`
    : ` <span class="muted">· 이 시간이 든 후보 없음(겹침·학점)</span>`;
}

function examPanelHtml(v, exByCode) {
  if (!S.term) return `<p class="muted">학사일정이 없어 달력을 그리지 않음</p>`;
  const colorOf = (code) => v.courses?.find((c) => c.code === code)?.color ?? 0;
  return `<section class="exams">${calendarHtml(S.term, calendarEvents(exByCode, S.term), { ym: calYm(), colorOf, nameOf: courseName })}</section>`;
}

/** 보는 달: 고른 달, 없으면 오늘이 든 달(학기 안일 때), 아니면 중간고사 달 */
function calYm() {
  const months = calMonths(S.term), today = kstNow().slice(0, 7);
  return [S.local.calYm, today, S.term.midterm[0].slice(0, 7)].find((m) => months.includes(m));
}

function footHtml() {
  return `${S.local.toast ? `<div class="toast" role="status" data-act="toastClose" title="누르면 닫힘">${esc(S.local.toast.text)}${S.local.toast.undo ? ` <button class="link" data-act="undo" data-focus="undo">되돌리기</button>` : ""}</div>` : ""}
    ${FULL ? `<footer>비공식 개인용 도구 · 학교 정보를 읽기만 하며 수강신청은 하지 않음 · 데이터는 이 PC에만 저장</footer>` : ""}`;
}

// ── 조작 ──
let toastTimer;
function toast(text, undo) {
  S.local.toast = { text, undo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (!document.querySelector(".toast")?.contains(document.activeElement)) { S.local.toast = null; render(); } }, 6000);
  render();
}
const cmd = (op, args) => send(S.termId, op, args).catch((e) => toast(e.message));

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled || el.tagName === "INPUT") return;
  const { act, code, cls } = el.dataset, v = view(), p = S.plan;
  // 고르는 중: 선택지(분반 줄·반투명 칸·같은 칸) 말고 다른 곳을 누르면 취소. 시간표 빈 곳 클릭은 취소만 한다.
  if (S.local.choose && !["pick", "goTime", "choose"].includes(act) && !e.target.closest(".pv.no")) {
    S.local.choose = null;
    if (act === "slot") { render(); return; }
  }
  if (act === "mode") { S.local.changed = false; cmd("view", { mode: el.dataset.mode }); }
  if (act === "prev" || act === "next") {
    const j = (v.i + (act === "next" ? 1 : -1) + v.n) % v.n;
    S.local.changed = false;
    cmd("view", p.view.mode === "fav" ? { favKey: p.favorites[j].key } : { autoKey: S.cands.list[j].key });
  }
  if (act === "heart") {
    const saved = p.favorites.find((f) => f.key === v.key);
    if (saved) { await cmd("removeFav", { key: saved.key }); toast("저장 해제", { op: "restoreFav", args: { fav: saved } }); }
    else cmd("saveFav", { fav: snapshot(v) });
  }
  if (act === "full") inExtension ? openFull() : open("?full");
  if (act === "side") chrome.sidePanel.open({ windowId: S.win });   // 열린 패널의 알림을 받고 이 탭은 닫힌다
  if (act === "pri") cmd("setPri", { code, pri: NEXT_PRI[p.courses[code].pri] });
  if (act === "gen") { recompute(); cmd("generate", { key: S.genKey }); }
  if (act === "cal") { const ms = calMonths(S.term); S.local.calYm = ms[ms.indexOf(calYm()) + Number(el.dataset.step)] ?? calYm(); render(); }
  if (act === "choose") {
    S.local.choose = S.local.choose === code ? null : code;
    if (FULL && S.local.choose) S.local.detail = code;               // 전체보기는 가운데 열에 상세도 함께
    render();
  }
  if (act === "slot") {
    if (e.target.closest(".pv, .blk")) return;
    const r = el.getBoundingClientRect(), days = el.dataset.days.split(",").map(Number), y = e.clientY - r.top;
    const day = days[Math.floor((e.clientX - r.left) / (r.width / days.length))];
    if (y < HEAD || day === undefined) return;
    const minute = Math.floor((Number(el.dataset.start) + (y - HEAD) / Number(el.dataset.px)) / 5) * 5;
    S.local.slot = { day, minute };
    S.local.detail = null;
    render();
  }
  if (act === "slotClear") { S.local.slot = null; render(); document.getElementById("q")?.focus(); }
  if (act === "undoGone" && S.local.gone) { const g = S.local.gone; S.local.gone = null; cmd("restore", { code: g.code, data: g.data, inBar: g.inBar }); }
  if (act === "detail") {
    S.local.detail = S.local.detail === code ? null : code;
    render();
    if (S.local.detail) document.querySelector('[data-act="close"]')?.focus();   // 키보드 사용자가 상세 안에서 이어 가도록
  }
  if (act === "close") { const c = S.local.detail; S.local.detail = null; render(); document.querySelector(`[data-focus="name-${CSS.escape(c)}"]`)?.focus(); }
  if (act === "pick") {
    S.local.choose = null;                                // 고르면 '고르는 중' 끝(다시 그리기 전에)
    if (v.fav) { S.local.favPicks[v.fav.key] = { ...S.local.favPicks[v.fav.key], [code]: (v.courses.find((c) => c.code === code).pick === cls ? "" : cls) }; render(); }
    else cmd("pick", { candKey: v.candKey, code, cls });
  }
  if (act === "add") {
    S.local.gone = null;
    S.local.pop = code;                                   // 다음 렌더의 ★만 한 번 튀게(검색 입력마다 다시 튀지 않도록 곧 지움)
    setTimeout(() => { if (S.local.pop === code) S.local.pop = null; }, 500);
    cmd("add", { code, ...(S.dataId && { from: S.dataId }) });
  }
  if (act === "copy") copyCodes(v);
  if (act === "goTime") {
    // 지금 후보의 다른 과목·시간을 가장 많이 유지하는 후보로(동점이면 목록 순서가 앞선 것)
    const keep = new Set((v.courses ?? []).filter((c) => c.code !== code).map((c) => `${c.code}:${c.bundle.key}`));
    const score = (c) => c.picks.filter((x) => keep.has(`${x.code}:${x.bundle.key}`)).length;
    const best = S.cands.list.filter((c) => c.picks.some((x) => x.code === code && x.bundle.key === el.dataset.key))
      .reduce((a, c) => (!a || score(c) > score(a) ? c : a), null);
    S.local.choose = null;
    if (best) { S.local.changed = false; cmd("view", { autoKey: best.key }); } else render();
  }
  if (act === "rebase") {
    const codes = oldInPlan();
    const saved = { courses: Object.fromEntries(codes.map((c) => [c, p.courses[c]])), bar: p.bar };
    S.local.detail = null;
    await cmd("rebase", { term: S.termId, keep: rebaseKeep() });
    toast(`이전 학기 과목 ${codes.length}개를 새 학기로 옮김`, { op: "restoreCourses", args: saved });
  }
  if (act === "clearAll" || act === "clearOld") {
    const codes = act === "clearAll" ? Object.keys(p.courses) : oldInPlan();
    const saved = { courses: Object.fromEntries(codes.map((c) => [c, p.courses[c]])), bar: p.bar };
    S.local.detail = null;
    await cmd("removeMany", { codes });
    toast(act === "clearAll" ? `담은 과목 ${codes.length}개를 모두 비움` : `이전 학기 과목 ${codes.length}개를 지움`, { op: "restoreCourses", args: saved });
  }
  if (act === "remove") {
    const data = p.courses[code], inBar = p.bar.includes(code);
    // 되돌리기는 화면 아래 알림 대신 목록의 그 자리에(알림이 사이드바 버튼을 가리지 않게)
    S.local.gone = { code, name: courseName(code), data, inBar };
    if (S.local.detail === code) S.local.detail = null;
    if (S.local.choose === code) S.local.choose = null;
    await cmd("remove", { code });
  }
  if (act === "toastClose") { S.local.toast = null; render(); }
  if (act === "undo" && S.local.toast?.undo) { const u = S.local.toast.undo; S.local.toast = null; cmd(u.op, u.args); }
  if (act === "retry") { for (const k of Object.keys(S.failed)) if (k.startsWith(`${code}-`)) delete S.failed[k]; render(); collect(); }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.act === "incl") cmd("exclude", { code: el.dataset.code, cls: el.dataset.cls, off: !el.checked });
  if (el.id === "max") setMax(el.value);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {                                   // 바깥쪽부터 하나씩 닫는다: 고르는 중 → 빈 시간 조건 → 상세
    if (S.local.choose) { S.local.choose = null; render(); }
    else if (S.local.slot) { S.local.slot = null; render(); }
    else if (S.local.detail) document.querySelector('[data-act="close"]')?.click();
  }
  if (e.key === "Enter" && e.target.id === "max") setMax(e.target.value);
});
let resizeTimer;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { S.gridH = null; render(); }, 80); });   // 시간표 높이는 창 높이를 따른다
// 마우스 올리기: 목록·검색 결과의 과목 → 시간표에 반투명 미리보기(시간표 부분만 다시 그려 목록 스크롤 유지).
// 시간표 칸 → 같은 과목의 다른 요일 칸과 목록 줄을 함께 강조(다시 그리지 않고 class만).
document.addEventListener("mouseover", (e) => {
  const t = e.target.closest?.("[data-hover]"), code = t?.dataset.hover ?? null;
  if (code !== S.local.hover && (code || !e.target.closest?.(".tt"))) { S.local.hover = code; renderGrid(); }   // 미리보기를 보러 시간표로 가는 동안은 유지
  const b = e.target.closest?.(".blk[data-code], .pv[data-code]")?.dataset.code ?? null;
  document.querySelectorAll(".hl").forEach((x) => x.classList.remove("hl"));
  if (b) document.querySelectorAll(`.blk[data-code="${CSS.escape(b)}"], [data-hover="${CSS.escape(b)}"]`).forEach((x) => x.classList.add("hl"));
});
function renderGrid() {
  const w = document.querySelector(".grid-wrap");
  if (!w || !S.loaded) return;
  w.outerHTML = gridHtml(view());
}
document.addEventListener("input", (e) => { if (e.target.id === "q") { S.local.query = e.target.value; render(); } });

function setMax(raw) {
  const value = Number(String(raw).trim());
  if (String(raw).trim() === "" || !Number.isFinite(value) || value < 0 || value > 60) { S.local.maxError = "0~60 사이 숫자"; render(); return; }
  S.local.maxError = "";
  if (value !== S.plan.maxCredit) cmd("setMax", { value }); else render();
}

/**
 * 보고 있는 시간표의 학수번호·분반을 줄마다 'KECE206 01 전자기학'으로 복사한다(파일을 만들지 않음).
 * 같은 시간 분반을 아직 안 골랐으면 '01/02'로 적고 알림에서 알려 준다.
 */
async function copyCodes(v) {
  const lines = codeLines(v.courses ?? []);
  const open = (v.courses ?? []).filter((c) => !c.pick).length;
  const text = lines.join("\n");
  try { await navigator.clipboard.writeText(text); }
  catch {                                                    // 포커스가 없을 때 등: 옛 방식으로
    const t = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(t); t.select(); document.execCommand("copy"); t.remove();
  }
  const stale = S.plan.view.mode === "auto" && S.dirty;
  toast(`학수번호 ${lines.length}개 복사함${open ? ` · ${open}과목은 분반을 아직 안 골라 '01/02'로 적음` : ""}${stale ? " · 담은 과목이 바뀌었는데 후보를 아직 다시 안 만듦(↻ 뒤 다시 복사)" : ""}`);
}

/** 저장본: 저장 당시 과목·묶음·분반 선택·교수·시험 판정을 그대로 보존 */
function snapshot(v) {
  const inView = new Set(v.courses.map((c) => c.code));
  return { key: v.key, candKey: v.candKey, credits: v.credits, lastYear: Boolean(S.lastYear),
    order: listing(S.plan, inView).included,
    courses: v.courses.map((c) => ({ code: c.code, name: c.name, credit: c.credit, color: c.color, bundle: c.bundle, sections: c.sections, pick: c.pick,
      exams: Object.fromEntries(c.bundle.cls.map((cls) => { const a = c.ana(cls); return [cls, a?.result ? a : { failed: "저장 당시 미확인" }]; })) })) };
}

boot().catch((e) => { document.getElementById("app").innerHTML = `<p class="banner">시작 오류: ${esc(e.message)}</p>`; });
