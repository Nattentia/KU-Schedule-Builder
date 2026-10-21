// 학기 흐름 시연: 가짜 시계 + 가짜 학교 서버로 실제 모듈(net·term·state)을 날짜 순서대로 돌린다. 학교 서버에 요청하지 않는다.
// 2026-12 (다음 학기 목록 미공개) → 2027-01 (공개) → 2027-02 수강신청 기간 → 2027-03 정정 기간 → 2027-03 하순(다음 학기로)
// 실행: node test/season.test.mjs
import { createNet, pickCatalog, pruneCache } from "../src/net.js";
import { kstNow, targetTerm } from "../src/term.js";
import { apply, emptyPlan, offOf, sectionOn, pickedOnly } from "../src/state.js";

let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };

let clock = 0;
const at = (kst) => (clock = Date.parse(`${kst}:00+09:00`));
const PUBLISHED_2027_1 = Date.parse("2027-01-15T00:00:00+09:00");
// 2027-1학기 수강신청·정정 일정(학교 로그인 화면의 표 모양)
const LOGIN = `<table><tr><th>구분</th><th>대상</th><th>기간</th></tr>
  <tr><td>수강신청</td><td>전체</td><td>2027-02-10(수) 10:00 ~ 02-12(금) 17:00</td></tr>
  <tr><td>수강신청 정정</td><td>전체</td><td>2027-03-03(수) 10:00 ~ 03-05(금) 17:00</td></tr></table>`;
const row = (year, term, cls) => ({ PARAMS: `${year}${term}KECE206${cls}`, YEAR: String(year), TERM: term, COUR_CD: "KECE206", COUR_CLS: cls });
const requests = [];
const fetch = async (url, init) => {
  requests.push(`${new Date(clock).toISOString().slice(0, 10)} ${url.replace(/\?.*/, "").replace(/^https:\/\/[^/]+/, "")}`);
  if (url.includes("loginPage")) return { ok: true, text: async () => LOGIN };
  const q = new URLSearchParams(init.body);
  const year = Number(q.get("pYear")), term = q.get("pTerm");
  const open = year < 2027 || clock >= PUBLISHED_2027_1;
  return { ok: true, json: async () => (open ? { code: "200", rows: ["01", "02", "03", "04"].map((c) => row(year, term, c)) } : { code: "-1", message: "조회 기간이 아님" }) };
};
const mem = new Map();
const store = { get: async (k) => mem.get(k), set: async (k, v) => { mem.set(k, v); } };

/** 플래너를 여는 것과 같은 순서: 학기 정하기 → 신청 일정 → 과목 목록 고르기 */
async function open(kst) {
  at(kst);
  const before = requests.length;
  const t = targetTerm(kstNow(clock));
  const net = createNet({ fetch, store, now: () => new Date(clock) });
  let windows = null;
  try { windows = await net.loadSchedule(); } catch { /* 기간 중 캐시 없음 */ }
  const pick = await pickCatalog(net, t);
  const inWindow = Boolean(windows?.some(([a, b]) => a <= kstNow(clock) && kstNow(clock) <= b));
  return { termId: `${t.year}-${t.code}`, dataId: `${pick.year}-${t.code}`, lastYear: pick.lastYear, blocked: Boolean(pick.blocked), rows: pick.rows.length,
    inWindow, net, sent: requests.slice(before) };
}
const ALL = ["01", "02", "03", "04"];
let plan = emptyPlan();

// ① 2026-12-10: 2027-1 목록 미공개 → 작년(2026-1) 목록으로 계획. 과목조회 1학기 목록에서 03분반을 담음
let s = await open("2026-12-10T20:00");
ok(s.termId === "2027-1R" && s.dataId === "2026-1R" && s.lastYear && s.rows === 4, "① 12월: 2027-1 계획, 목록은 작년 2026-1", s);
plan = apply(plan, "section", { code: "KECE206", cls: "03", from: "2026-1R" }, 1);
ok(offOf(plan.courses.KECE206, ALL, s.dataId).join() === "01,02,04", "① 작년 목록에서 고른 03분반만 후보에 씀", plan.courses.KECE206);

// ② 2027-01-20: 2027-1 목록 공개 → 그 목록으로 바뀜. 작년에 고른 '03분반'은 다른 수업이라 쓰지 않음(모든 분반으로 계산 + 안내)
s = await open("2027-01-20T20:00");
ok(s.termId === "2027-1R" && s.dataId === "2027-1R" && !s.lastYear, "② 1월: 공개된 2027-1 목록으로 자동 전환", s);
ok(!pickedOnly(plan.courses.KECE206, s.dataId) && offOf(plan.courses.KECE206, ALL, s.dataId).join() === "", "② 작년 목록에서 고른 분반은 무시(모든 분반)", plan.courses.KECE206);
ok(!sectionOn(plan.courses.KECE206, "03", "2027-1R") && sectionOn(plan.courses.KECE206, "03", "2026-1R"), "② 2027-1 과목조회에서는 03분반 별이 꺼져 보임", plan.courses.KECE206);
plan = apply(plan, "section", { code: "KECE206", cls: "01", from: "2027-1R" }, 2);
ok(plan.courses.KECE206.only.join() === "01" && offOf(plan.courses.KECE206, ALL, s.dataId).join() === "02,03,04", "② 2027-1 목록에서 다시 고른 01분반만 씀", plan.courses.KECE206);

// ③ 2027-02-11: 수강신청 기간. 캐시(1일)가 지났어도 학교 서버에 요청 0, 목록은 캐시, 계획서 새 요청은 막힘
s = await open("2027-02-11T12:00");
ok(s.inWindow && s.sent.length === 0, "③ 신청 기간: 요청 0건", s.sent);
ok(s.dataId === "2027-1R" && s.rows === 4 && !s.lastYear, "③ 신청 기간: 받아 둔 2027-1 목록 그대로", s);
let err = null;
try { await s.net.plan(row(2027, "1R", "02")); } catch (e) { err = e.code; }
ok(err === "BLOCKED" && s.sent.length === 0 && requests.length === requests.length, "③ 신청 기간: 안 받아 둔 계획서는 요청하지 않고 막음", err);

// ④ 2027-03-04: 정정 기간. 아직 2027-1을 계획하고 요청 0
s = await open("2027-03-04T12:00");
ok(s.termId === "2027-1R" && s.inWindow && s.sent.length === 0, "④ 정정 기간: 2027-1 그대로, 요청 0건", s);

// ⑤ 2027-03-20: 정정이 끝나 다음 학기(2027-2)로. 2027-2 목록이 미공개면 작년 2026-2
s = await open("2027-03-20T12:00");
ok(s.termId === "2027-2R" && !s.inWindow && s.sent.length > 0, "⑤ 3월 하순: 2027-2 계획으로 넘어감", { termId: s.termId, sent: s.sent.length });

// ⑥ 처음 설치를 신청 기간 한가운데에 한 경우: 일정을 모르니 일정 한 번만 받고, 목록은 막혀 빈 목록
mem.clear();
s = await open("2027-02-11T13:00");
ok(s.inWindow && s.blocked && s.rows === 0 && s.sent.length === 1 && s.sent[0].includes("loginPage"), "⑥ 신청 기간 첫 설치: 일정 1건만 받고 나머지는 막음", s.sent);

// ⑥-2 인터넷이 끊긴 채 캐시가 지난 뒤 열어도: 받아 둔 2027-1 목록을 그대로 쓴다(작년 목록으로 넘어가지 않음)
{ const saved = new Map(mem); mem.clear();
  await open("2027-01-20T20:00");                 // 2027-1 목록을 받아 둠
  const off = createNet({ fetch: async () => { throw new TypeError("Failed to fetch"); }, store, now: () => new Date(at("2027-01-25T20:00")) });
  const pick = await pickCatalog(off, { year: 2027, code: "1R" });
  ok(!pick.lastYear && pick.year === 2027 && pick.rows.length === 4, "⑥-2 오프라인·캐시 만료: 받아 둔 이번 학기 목록 유지", pick);
for (const [k, v] of saved) mem.set(k, v); }

// ⑦ 학기가 바뀌면 캐시 정리: 지금 두 학기(계획·목록) 밖의 목록·계획서와, 남은 계획서가 가리키지 않는 첨부를 지움. 일정·학사일정은 둠
{ const m = new Map([
    ["lect:20261R:00", { v: [] }], ["lect:20252R:00", { v: [] }],
    ["plan:20261R:A", { v: { dsSles361: [{ attflUuid: "U1" }] } }], ["plan:20252R:B", { v: { dsSles361: [{ attflUuid: "U2" }] } }],
    ["flist:U1", {}], ["file:U1:1", {}], ["flist:U2", {}], ["file:U2:1", {}], ["file:U3:1", {}], ["schedule", {}], ["registrar", {}]]);
  const st = { get: async (k) => m.get(k), keys: async () => [...m.keys()], del: async (k) => { m.delete(k); } };
  const n = await pruneCache(st, ["20271R", "20261R"]);
  ok(n === 5 && [...m.keys()].join() === "lect:20261R:00,plan:20261R:A,flist:U1,file:U1:1,schedule,registrar", "⑦ 지난 학기 캐시와 쓰지 않는 첨부만 지움", [...m.keys()]); }

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
