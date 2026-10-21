// 상태 변경·목록 배치·시험 요약 테스트 (E8·E9·E14·E21~E26). 실행: node test/state.test.mjs
import { apply, emptyPlan, listing, inputKey, favKey, offOf, sectionOn, oldCourses, codeLines } from "../src/state.js";
import { examsOf, examText, examClashes, calendarEvents } from "../src/exams.js";
import { makeTerm, kstNow, targetTerm } from "../src/term.js";

let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };
let p = emptyPlan(), t = 1;
const run = (op, args) => (p = apply(p, op, args, t++));

run("add", { code: "AAA101" }); run("add", { code: "BBB101" }); run("add", { code: "CCC101" });
ok(p.bar.join() === "CCC101" && p.courses.AAA101.pri === "want", "새로 담음은 가장 최근 하나만, 기본 되면", p.bar);
let L = listing(p, new Set(["AAA101"]));
ok(L.bar.join() === "CCC101" && L.included.join() === "AAA101" && L.excluded.join() === "BBB101", "E24 바의 과목은 목록에 중복 없음, 앞서 담은 과목은 목록으로", L);
const before = inputKey(p);
run("setPri", { code: "CCC101", pri: "want" });
ok(p.bar.join() === "CCC101" && inputKey(p) === before, "E25 같은 값 → 그대로, 재계산 없음", p.bar);
run("setPri", { code: "CCC101", pri: "spare" }); run("setPri", { code: "CCC101", pri: "want" });
ok(p.bar.join() === "CCC101", "순위 칩을 돌려도 바에 남음", p.bar);
run("generate", { key: inputKey(p) });
ok(!p.bar.length && p.gen === inputKey(p), "후보 생성 → 바 비움, 생성 입력 기록", p.bar);
run("setPri", { code: "BBB101", pri: "need" });
ok(inputKey(p) !== before, "E26 다른 값 → 재계산", p.bar);
L = listing(p, new Set(["AAA101"]));
ok(L.included.join() === "AAA101" && L.excluded.join() === "CCC101,BBB101" && !L.bar.length, "E21 현재 후보 과목이 위, 그룹 안은 최근 담은 순", L);
L = listing(p, new Set(["BBB101"]));
ok(L.included.join() === "BBB101" && L.excluded.join() === "CCC101,AAA101", "E21 후보를 넘기면 재배열", L);

const fav = { key: favKey("AAA101:0:720-795"), order: ["AAA101"], credits: 3, courses: [{ code: "AAA101", cls: ["01"] }] };
run("saveFav", { fav });
const saved = JSON.stringify(p.favorites);
run("setPri", { code: "AAA101", pri: "need" }); run("remove", { code: "AAA101" }); run("add", { code: "DDD101" });
run("exclude", { code: "BBB101", cls: "01", off: true }); run("setMax", { value: 9 });
ok(JSON.stringify(p.favorites) === saved, "E8·E9·E23 조건이 바뀌어도 저장본 그대로", p.favorites);
run("saveFav", { fav });
ok(p.favorites.length === 1, "같은 저장본은 중복 저장 안 함");

run("pick", { candKey: "K", code: "BBB101", cls: "02" });
ok(p.picks.K.BBB101 === "02", "분반 고르기");
run("pick", { candKey: "K", code: "BBB101", cls: "02" });
ok(!p.picks.K, "같은 분반 다시 누르면 해제", p.picks);
ok(favKey("K", { B: "02" }) !== favKey("K", {}), "분반 선택이 다르면 다른 저장본");

let threw = 0;
for (const [op, a] of [["add", { code: "<script>" }], ["setMax", { value: -1 }], ["setPri", { code: "BBB101", pri: "x" }], ["nope", {}], ["setMax", { value: "18" }]])
  try { apply(p, op, a); } catch { threw++; }
ok(threw === 5, "잘못된 명령은 거부", threw);

// 시험 요약
const A = { result: [{ exam: "midterm", state: "확정", date: "2026-10-22" }, { exam: "final", state: "확정", date: "2026-12-17" }] };
const B = { result: [{ exam: "midterm", state: "확정", date: "2026-10-21" }, { exam: "final", state: "확정", date: "2026-12-17" }] };
const ana = { "01": A, "02": B };
let ex = examsOf(["01", "02"], (c) => ana[c]);
ok(ex.items.find((x) => x.exam === "midterm").differ && ex.items.find((x) => x.exam === "final").date === "2026-12-17", "E14 분반마다 다른 시험만 다름", ex);
ok(examsOf(["01", "03"], (c) => ana[c]).pending, "읽기 전이면 확인 중");
ok(examText({ exam: "final", state: "확정", date: "2026-12-19" }).text === "기말 12/19(토)" && examText({ exam: "final", state: "주차", date: "12/08~12/14" }).text === "기말 12/8~12/14", "시험 문구", examText({ exam: "final", state: "주차", date: "12/08~12/14" }));
const byCode = new Map([["X", examsOf(["01"], (c) => ana[c])], ["Y", examsOf(["02"], (c) => ana[c])]]);
const cl = examClashes(byCode);
ok(cl.get("X")?.[0]?.other === "Y" && cl.get("Y")?.[0]?.date === "2026-12-17" && cl.get("X").length === 1, "같은 날 확정 시험 겹침", [...cl]);
const term = makeTerm({ year: 2026, code: "2R", start: "2026-09-01", midterm: ["2026-10-20", "2026-10-26"], final: ["2026-12-14", "2026-12-18"] });
const ev = calendarEvents(new Map([["Z", { items: [{ exam: "final", state: "기간", date: "12/10~12/16" }, { exam: "midterm", state: "예상", date: "10/20~10/26" }] }]]), term);
ok(ev.length === 1 && ev[0].from === "2026-12-10" && ev[0].to === "2026-12-16", "달력: 기간은 범위, 예상은 안 찍음", ev);
const alt = { A: { result: [{ exam: "-", state: "시험 없음" }], alt: [{ exam: "midterm", label: "과제 대체" }], quiz: [{ date: "2026-10-14" }, { date: "2026-11-11" }] },
  B: { result: [{ exam: "-", state: "시험 없음" }], alt: [{ exam: "midterm", label: "과제 대체" }], quiz: [{ date: "2026-10-14" }] } };
const ab = examsOf(["A", "B"], (c) => alt[c]);
ok(ab.items.map((x) => examText(x).text).join() === "중간 → 과제 대체" && examText(ab.items[0], true).text === "중 과제대체", "대체: 시험 없음 대신 '중간 → 과제 대체'", ab.items);
ok(ab.quiz.join() === "2026-10-14", "퀴즈 날짜는 모든 분반이 같은 것만", ab.quiz);
const qe = calendarEvents(new Map([["Q", ab]]), term);
ok(qe.length === 1 && qe[0].quiz && qe[0].from === "2026-10-14", "달력: 퀴즈 하루, 대체는 안 찍음", qe);

// 학기 선택은 기기 시간대와 무관하게 한국 날짜로: UTC 2026-09-15 16:00 = KST 9/16 01:00 → 다음 해 1학기
const edge = Date.UTC(2026, 8, 15, 16);
ok(kstNow(edge) === "2026-09-16T01:00" && targetTerm(kstNow(edge)).code === "1R" && targetTerm(kstNow(edge)).year === 2027, "KST 기준 학기", kstNow(edge));
// 3월·9월 초 수강정정 기간에는 아직 그 학기
ok(["2026-01-05", "2026-03-05", "2026-03-16", "2026-08-31", "2026-09-03", "2026-09-16", "2026-12-31"].map((d) => Object.values(targetTerm(d)).join("")).join()
  === "20261R,20261R,20262R,20262R,20262R,20271R,20271R", "학기 경계(정정 기간 포함)");

// 과목조회 별 = 분반. 고른 분반만 후보에 쓰고, 다른 분반을 더하면 함께(같은 시간이면 묶이고 다르면 갈래), 마지막을 빼면 과목도 뺀다
{ let q = emptyPlan(); const S = (cls) => (q = apply(q, "section", { code: "ECE201", cls }, 1)), ALL = ["01", "02", "03", "04"];
  S("01");
  ok(q.courses.ECE201.only.join() === "01" && offOf(q.courses.ECE201, ALL).join() === "02,03,04" && q.bar.join() === "ECE201", "분반 하나 담기 → 그 분반만", q.courses.ECE201);
  S("03");
  ok(offOf(q.courses.ECE201, ALL).join() === "02,04" && sectionOn(q.courses.ECE201, "03") && !sectionOn(q.courses.ECE201, "02"), "분반 더하기", q.courses.ECE201);
  const k = inputKey(q); S("01");
  ok(offOf(q.courses.ECE201, ALL).join() === "01,02,04" && inputKey(q) !== k, "분반 빼기 → 다시 계산", q.courses.ECE201);
  q = apply(q, "exclude", { code: "ECE201", cls: "03", off: true });
  ok(!sectionOn(q.courses.ECE201, "03"), "상세에서 뺀 분반은 별 꺼짐");
  S("03");
  ok(sectionOn(q.courses.ECE201, "03") && !q.courses.ECE201.excluded.length, "꺼진 분반 별 → 다시 켜짐", q.courses.ECE201);
  S("03");
  ok(!q.courses.ECE201, "마지막 분반 빼면 과목도 빠짐", q.courses);
  q = apply(q, "add", { code: "ECE201" }, 2); S("02");
  ok(!q.courses.ECE201.only && offOf(q.courses.ECE201, ALL).join() === "02", "과목째 담은 것은 그 분반만 빼기", q.courses.ECE201); }

// 이전 학기 정보로 담은 과목 가려내기, 한꺼번에 빼기와 되돌리기
{ let q = emptyPlan();
  q = apply(q, "add", { code: "AAA101", from: "2026-1R" }, 1);
  q = apply(q, "section", { code: "BBB101", cls: "01", from: "2027-1R" }, 2);
  q = apply(q, "add", { code: "CCC101" }, 3);
  ok(oldCourses(q, "2027-1R").join() === "AAA101,CCC101", "이전 학기 목록·출처 모름 → 이전 과목", oldCourses(q, "2027-1R"));
  const saved = { courses: q.courses, bar: q.bar };
  q = apply(q, "removeMany", { codes: Object.keys(q.courses) });
  ok(!Object.keys(q.courses).length && !q.bar.length, "모두 비우기", q);
  q = apply(q, "restoreCourses", saved);
  ok(Object.keys(q.courses).join() === "AAA101,BBB101,CCC101" && q.bar.join() === "CCC101" && q.courses.BBB101.only.join() === "01", "비우기 되돌리기", q); }

// 과목을 지우면 후보도 다시 만든다(지운 과목이 시간표·복사에 남지 않게), 그 과목이 든 후보의 분반 선택도 버린다
{ let q = emptyPlan();
  q = apply(q, "add", { code: "AAA101", from: "2027-1R" }, 1); q = apply(q, "add", { code: "BBB101", from: "2027-1R" }, 2);
  q = apply(q, "pick", { candKey: "AAA101:0:540-615|BBB101:1:540-615", code: "BBB101", cls: "02" });
  q = apply(q, "pick", { candKey: "AAA101:0:540-615", code: "AAA101", cls: "01" });
  q = apply(q, "remove", { code: "BBB101" });
  ok(q.gen === inputKey(q) && Object.keys(q.picks).join() === "AAA101:0:540-615", "지우기 → 후보 다시 만들기, 지운 과목이 든 후보의 선택 버림", q);
  const data = { pri: "want", addedAt: 2, excluded: [], color: 1, from: "2027-1R" };
  q = apply(q, "restore", { code: "BBB101", data, inBar: false });
  ok(q.courses.BBB101 && q.gen === inputKey(q), "지우기 되돌리기 → 후보도 다시 만들기", q); }

// 새 학기 목록이 나오면 연습 과목 옮기기: 새 목록에 있으면 학수번호만 남기고 분반 선택 초기화, 없으면 뺌, 새 학기 과목은 그대로
{ let q = emptyPlan();
  q = apply(q, "section", { code: "AAA101", cls: "03", from: "2026-1R" }, 1);
  q = apply(q, "add", { code: "BBB101", from: "2026-1R" }, 2); q = apply(q, "exclude", { code: "BBB101", cls: "01", off: true });
  q = apply(q, "add", { code: "GONE101", from: "2026-1R" }, 3);
  q = apply(q, "section", { code: "NEW101", cls: "02", from: "2027-1R" }, 4);
  q = apply(q, "setPri", { code: "AAA101", pri: "need" });
  const saved = { courses: Object.fromEntries(oldCourses(q, "2027-1R").map((c) => [c, q.courses[c]])), bar: q.bar };
  q = apply(q, "rebase", { term: "2027-1R", keep: ["AAA101", "BBB101", "NEW101"] });
  ok(Object.keys(q.courses).sort().join() === "AAA101,BBB101,NEW101" && !q.courses.AAA101.only && q.courses.AAA101.pri === "need"
    && !q.courses.BBB101.excluded.length && q.courses.NEW101.only.join() === "02" && !oldCourses(q, "2027-1R").length && q.gen === inputKey(q),
    "새 학기로 옮기기: 있는 과목은 분반 초기화(순위·색 유지), 없는 과목은 뺌", q.courses);
  q = apply(q, "restoreCourses", saved);
  ok(q.courses.AAA101.only.join() === "03" && q.courses.GONE101 && q.courses.BBB101.excluded.join() === "01", "옮기기 되돌리기", q.courses); }

ok(codeLines([{ code: "KECE206", pick: "01", bundle: { cls: ["01"] }, name: "전자기학" }, { code: "CHBE205", pick: null, bundle: { cls: ["01", "02"] }, name: "생명공학" }]).join("|")
  === "KECE206 01 전자기학|CHBE205 01/02 생명공학", "학수번호 복사 줄", null);

ok(JSON.stringify(examsOf([], () => undefined)) === '{"pending":false,"failed":null,"items":[],"quiz":[]}', "분반을 모두 뺀 과목 → 빈 시험(화면 시작 오류 없음)");

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
