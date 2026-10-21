// 분반 경우의 수: 같은 시간 다른 교수 / 같은 교수 다른 시간 / 다른 교수 다른 시간 / 겹침 / 고르기·빼기·되살리기 반복.
// 실제 모듈(catalog·candidates·state)로 확인한다. 실행: node test/sections.test.mjs
import { buildCourses, bundlesOf, blockReason } from "../src/catalog.js";
import { generate } from "../src/candidates.js";
import { apply, emptyPlan, offOf, sectionOn, pickIn } from "../src/state.js";

let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };
const R = (code, cls, prof, time, credit = 3) => ({ COUR_CD: code, COUR_CLS: cls, COUR_NM: code, PROF_NM: prof, TIME_ROOM: time, TIME: "3(3)", CREDIT: credit, APPLY_DEPT: "" });
const courses = buildCourses([
  R("SAME", "01", "김", "월(3) A101<br>수(3) A101"), R("SAME", "02", "이", "월(3) B202<br>수(3) B202"), R("SAME", "03", "박", "월(3) C303<br>수(3) C303"),   // 같은 시간 다른 교수
  R("PROF", "01", "최", "화(2) D1<br>목(2) D1"), R("PROF", "02", "최", "화(5) D1<br>목(5) D1"),                                              // 같은 교수 다른 시간
  R("DIFF", "01", "정", "금(1) E1"), R("DIFF", "02", "한", "금(4) E2"),                                                                    // 다른 교수 다른 시간
  R("HIT", "01", "윤", "월(3) F1"),                                                                                                       // SAME과 겹침
  R("TBA", "01", "서", "미정"),                                                                                                           // 시간 확인 필요
]);
const all = (code) => courses.get(code).sections.map((s) => s.cls);
const input = (plan, term = "2027-1R") => Object.entries(plan.courses).flatMap(([code, c]) => {
  const course = courses.get(code), off = offOf(c, all(code), term);
  return blockReason(course, off) ? [] : [{ code, name: code, pri: c.pri, credit: course.credit, bundles: bundlesOf(course, off) }];
});
const bundleOf = (cand, code) => cand.picks.find((p) => p.code === code)?.bundle;

// 같은 시간 다른 교수: 한 칸(묶음)으로, 분반은 후보 안에서 고른다
let b = bundlesOf(courses.get("SAME"));
ok(b.length === 1 && b[0].cls.join() === "01,02,03", "같은 시간 다른 교수 → 한 묶음(분반 선택)", b);
// 같은 교수 다른 시간 / 다른 교수 다른 시간: 시간마다 다른 갈래
ok(bundlesOf(courses.get("PROF")).length === 2 && bundlesOf(courses.get("DIFF")).length === 2, "다른 시간 → 갈래 둘", [bundlesOf(courses.get("PROF")).length, bundlesOf(courses.get("DIFF")).length]);
// 시간 미정 분반만 있으면 후보에 못 넣고 이유를 단다
ok(blockReason(courses.get("TBA")) === "시간 확인 필요", "시간 미정 → 이유 표시", blockReason(courses.get("TBA")));

// 과목째 담기 → 후보: PROF·DIFF는 시간별로 갈래, SAME과 HIT는 겹쳐 함께 못 듦
let p = emptyPlan();
for (const code of ["SAME", "PROF", "DIFF", "HIT"]) p = apply(p, "add", { code, from: "2027-1R" }, 1);
let r = generate(input(p), 99);
ok(r.list.length === 8 && r.list.every((c) => !(bundleOf(c, "SAME") && bundleOf(c, "HIT"))), "겹치는 과목은 한 후보에 같이 안 듦, 다른 시간 분반은 갈래(2×2×2)", r.list.length);

// 과목조회에서 SAME 02분반만 → 그 분반만(고를 것 없음)
p = emptyPlan();
p = apply(p, "section", { code: "SAME", cls: "02", from: "2027-1R" }, 1);
r = generate(input(p), 99);
ok(r.list.length === 1 && bundleOf(r.list[0], "SAME").cls.join() === "02" && pickIn(bundleOf(r.list[0], "SAME").cls, null) === "02", "한 분반만 고름 → 그 분반으로 확정", r.list);
// 같은 시간 01 더함 → 다시 묶음(분반 선택)
p = apply(p, "section", { code: "SAME", cls: "01", from: "2027-1R" }, 2);
r = generate(input(p), 99);
ok(bundleOf(r.list[0], "SAME").cls.join() === "01,02", "같은 시간 분반 둘 → 한 칸에서 고르기", bundleOf(r.list[0], "SAME"));
// 후보 안에서 01을 고른 뒤 01을 빼면 고른 값은 무효(남은 02로 확정), 02까지 빼면 과목이 빠짐
const key = r.list[0].key;
p = apply(p, "pick", { candKey: key, code: "SAME", cls: "01" });
p = apply(p, "section", { code: "SAME", cls: "01", from: "2027-1R" }, 3);
r = generate(input(p), 99);
ok(r.list[0].key === key && pickIn(bundleOf(r.list[0], "SAME").cls, p.picks[key]?.SAME) === "02", "고른 분반을 빼면 남은 분반으로(옛 선택 안 씀)", { picks: p.picks, b: bundleOf(r.list[0], "SAME") });
// 분반 셋 중 고른 것만 빼면 아직 안 고른 상태로
{ let q = apply(emptyPlan(), "add", { code: "SAME", from: "2027-1R" }, 1);
  const k = generate(input(q), 99).list[0].key;
  q = apply(q, "pick", { candKey: k, code: "SAME", cls: "02" });
  q = apply(q, "exclude", { code: "SAME", cls: "02", off: true });
  const bb = bundleOf(generate(input(q), 99).list[0], "SAME");
  ok(bb.cls.join() === "01,03" && pickIn(bb.cls, q.picks[k]?.SAME) === null, "셋 중 고른 분반을 빼면 다시 고르기", { bb, pick: q.picks[k] }); }

// 같은 교수 다른 시간에서 01만 → 화2 하나, 02 더하면 갈래 둘
p = apply(emptyPlan(), "section", { code: "PROF", cls: "01", from: "2027-1R" }, 1);
ok(generate(input(p), 99).list.length === 1, "다른 시간 중 하나만 고름 → 그 시간만");
p = apply(p, "section", { code: "PROF", cls: "02", from: "2027-1R" }, 2);
r = generate(input(p), 99);
ok(r.list.length === 2 && new Set(r.list.map((c) => bundleOf(c, "PROF").key)).size === 2, "다른 시간 분반 더함 → 갈래 둘", r.list.length);

// 겹치는 분반만 고르면: 필수끼리 충돌 → 두 갈래(E1), 겹치지 않는 분반을 고르면 같이 듦
p = emptyPlan();
p = apply(p, "section", { code: "SAME", cls: "01", from: "2027-1R" }, 1);
p = apply(p, "section", { code: "HIT", cls: "01", from: "2027-1R" }, 2);
p = apply(p, "setPri", { code: "SAME", pri: "need" }); p = apply(p, "setPri", { code: "HIT", pri: "need" });
r = generate(input(p), 99);
ok(r.M === 1 && r.list.length === 2, "고른 분반끼리 겹침 → 두 갈래", r);

// 무작위 넣기·빼기 300번: 별 상태(sectionOn)와 후보에 쓰는 분반(offOf 밖)이 언제나 같고, 분반이 하나도 없으면 과목이 빠져 있다
let seed = 7; const rnd = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
p = emptyPlan();
let broken = null;
for (let i = 0; i < 300 && !broken; i++) {
  const code = ["SAME", "PROF", "DIFF"][rnd(3)], cls = all(code)[rnd(all(code).length)], op = rnd(4);
  if (op === 0) p = apply(p, "section", { code, cls, from: "2027-1R" }, i);
  else if (op === 1 && p.courses[code]) p = apply(p, "exclude", { code, cls, off: rnd(2) === 0 });
  else if (op === 2) p = apply(p, "add", { code, from: "2027-1R" }, i);
  else if (p.courses[code]) p = apply(p, "remove", { code });
  for (const [c, v] of Object.entries(p.courses)) {
    const off = offOf(v, all(c), "2027-1R");
    for (const x of all(c)) if (sectionOn(v, x, "2027-1R") !== !off.includes(x)) broken = { i, c, x, v, off };
    if (v.only && !v.only.length) broken = { i, c, empty: v };
  }
  try { generate(input(p), 18); } catch (e) { broken = { i, error: e.message }; }
}
ok(!broken, "무작위 300번: 별 상태 = 후보에 쓰는 분반, 빈 선택 없음, 후보 생성 오류 없음", broken);

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
