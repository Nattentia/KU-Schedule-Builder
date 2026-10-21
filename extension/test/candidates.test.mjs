// 후보 생성·정렬·카탈로그 정규화 회귀 테스트 (CANDIDATE_PROBLEM.md §9). 실행: node test/candidates.test.mjs
import { generate, overlap } from "../src/candidates.js";
import { parseTime, buildCourses, bundlesOf, blockReason, splitProfs } from "../src/catalog.js";
import { slotKey } from "../src/catalog.js";

let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };
const T = { 월3: [0, 720, 795], 수3: [2, 720, 795], 화2: [1, 630, 705], 목2: [3, 630, 705], 금1: [4, 540, 615], 화4: [1, 810, 885] };
const b = (...names) => { const slots = names.map((n) => ({ day: T[n][0], start: T[n][1], end: T[n][2] })); return { key: slotKey(slots), slots, cls: ["01"] }; };
const C = (code, pri, bundles, credit = 3, name = code) => ({ code, name, pri, credit, bundles });
const keys = (r) => r.list.map((c) => c.picks.map((p) => p.code).sort().join("+"));
const BIG = 99;

{ const r = generate([C("A", "need", [b("월3")]), C("B", "need", [b("월3")])], BIG);
  ok(r.M === 1 && keys(r).join() === "A,B", "E1 필수끼리 충돌 → 두 갈래", keys(r)); }
{ const r = generate([C("A", "need", [b("월3"), b("화2")]), C("B", "need", [b("월3")])], BIG);
  ok(r.M === 2 && keys(r).join() === "A+B" && r.list[0].picks.find((p) => p.code === "A").bundle.key === b("화2").key, "E2 비충돌 분반만", r.list); }
{ const r = generate([C("A", "need", [b("월3", "수3")]), C("B", "need", [b("월3")]), C("C", "need", [b("수3")])], BIG);
  ok(r.M === 2 && keys(r).join() === "B+C", "E3 필수 최대만", keys(r)); }
{ const r = generate([C("A", "need", [b("금1")]), C("X", "want", [b("월3")], 3, "엑스"), C("Y", "want", [b("월3")], 2, "와이")], BIG);
  ok(keys(r).join() === "A+X,A+Y", "E4 되면 충돌 → 둘 다, 학점 순", keys(r)); }
{ const r = generate([C("A", "need", [b("월3")]), C("B", "need", [b("화2")]), C("C", "need", [b("금1")]), C("D", "need", [b("화4")]), C("X", "want", [b("목2")])], 12);
  ok(r.M === 4 && keys(r).join() === "A+B+C+D", "E5 한도 12 → 되면 못 들어감", keys(r)); }
{ const four = [C("A", "need", [b("월3")]), C("B", "need", [b("화2")]), C("C", "need", [b("금1")]), C("D", "need", [b("화4")])];
  const r = generate(four, 9);
  ok(r.M === 3 && r.list.length === 4 && r.list.every((c) => c.credits === 9), "E6 한도 9 → 필수 3개 네 후보", keys(r));
  const r7 = generate([...four.slice(0, 3), { ...four[3], pri: "want" }], 9);
  ok(keys(r7).join() === "A+B+C", "E7 내린 과목 추가 불가", keys(r7)); }
{ const bb = b("월3"); bb.cls = ["01", "02"];
  const r = generate([C("A", "need", [bb])], BIG);
  ok(r.list.length === 1 && r.list[0].credits === 3, "E10 같은 시간 분반은 한 후보, 학점 한 번", r.list); }
{ const r = generate([C("A", "need", [b("월3", "수3"), b("월3", "화2")])], BIG);
  ok(r.list.length === 2, "E11 일부 요일만 같으면 별도 후보", keys(r)); }
{ const r = generate([C("A", "need", [b("월3")]), C("X", "spare", [b("화2")])], BIG);
  ok(keys(r).join() === "A+X", "E12 더 채울 수 있는 후보 제거", keys(r)); }
{ const r = generate([C("P1", "want", [b("월3")], 6, "가"), C("P2", "want", [b("화2")], 6, "나"), C("Q", "want", [b("월3", "화2")], 18, "다")], BIG);
  ok(keys(r).join() === "P1+P2,Q", "E13 되면 수 우선, 학점 큰 후보도 유지", keys(r)); }
{ ok(!overlap([{ day: 0, start: 540, end: 600 }], [{ day: 0, start: 600, end: 660 }]) && overlap([{ day: 0, start: 540, end: 600 }], [{ day: 0, start: 599, end: 660 }]), "E15 끝=시작 허용, 1분 겹침은 충돌"); }
{ const r = generate([C("A", "need", [b("월3")], 9), C("B", "need", [b("화2")], 3), C("C", "need", [b("월3")], 3)], 9);
  ok(r.M === 2 && keys(r).join() === "B+C", "E17 한도 안에서 M", keys(r)); }
{ const cs = [C("A", "need", [b("월3"), b("화2")]), C("B", "want", [b("월3")]), C("C", "spare", [b("화2"), b("금1")])];
  const r1 = generate(cs, BIG), r2 = generate([...cs].reverse().map((c) => ({ ...c, bundles: [...c.bundles].reverse() })), BIG);
  ok(JSON.stringify(r1) === JSON.stringify(r2), "E18 입력 순서 무관", [keys(r1), keys(r2)]); }
{ const r = generate([C("X", "want", [b("월3")]), C("Y", "spare", [b("월3")])], BIG);
  ok(r.M === 0 && keys(r).join() === "X,Y", "E19 필수 없음", keys(r));
  ok(generate([], BIG).list.length === 0, "E19 담은 과목 없음 → 후보 0"); }
{ const r = generate([C("A1", "want", [b("월3")], 3, "영어"), C("A2", "want", [b("화2")], 3, "영어")], BIG);
  ok(keys(r).join() === "A1+A2", "E20 같은 이름 다른 학수번호", keys(r)); }

// 가지치기가 결과를 바꾸지 않는지: 작은 무작위 입력을 전수 나열과 비교
{ let seed = 7; const rnd = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
  const names = Object.keys(T); let mism = 0;
  for (let t = 0; t < 300; t++) {
    const cs = Array.from({ length: 1 + rnd(5) }, (_, i) => C(`K${i}`, ["need", "want", "spare"][rnd(3)],
      [...new Map(Array.from({ length: 1 + rnd(2) }, () => b(names[rnd(6)], names[rnd(6)])).map((x) => [x.key, x])).values()], 1 + rnd(3)));
    const max = 3 + rnd(9);
    const brute = [];
    (function all(i, acc) {
      if (i === cs.length) { brute.push(acc); return; }
      all(i + 1, acc);
      for (const bb of cs[i].bundles) all(i + 1, [...acc, { c: cs[i], bb }]);
    })(0, []);
    const valid = brute.filter((s) => s.reduce((x, y) => x + y.c.credit, 0) <= max && s.every((x, i) => s.every((y, j) => i === j || !overlap(x.bb.slots, y.bb.slots))));
    const M = Math.max(0, ...valid.map((s) => s.filter((x) => x.c.pri === "need").length));
    const keyOf = (s) => s.map((x) => `${x.c.code}:${x.bb.key}`).sort().join("|");
    const vset = new Set(valid.map(keyOf));
    const want = valid.filter((s) => s.length && s.filter((x) => x.c.pri === "need").length === M
      && !cs.some((c) => !s.some((x) => x.c === c) && c.bundles.some((bb) => vset.has(keyOf([...s, { c, bb }]))))).map(keyOf).sort();
    const got = generate(cs, max).list.map((c) => c.key).sort();
    mism += JSON.stringify(want) !== JSON.stringify(got);
  }
  ok(mism === 0, "무작위 300건 전수 나열과 일치", mism); }

// 카탈로그 정규화
ok(JSON.stringify(parseTime("화(3-4)  127<br>목(4)  127").slots) === JSON.stringify([{ day: 1, start: 720, end: 885 }, { day: 3, start: 810, end: 885 }]), "연강·다중 요일");
ok(parseTime("화(3) 105<br>화(3) 109").slots.length === 1, "강의실만 다른 중복 구간 제거");
ok(parseTime("화(2) 신공학관 B101호\r<br>목(2) 신공학관 B101호").slots.length === 2, "\\r<br> 구분");
ok(parseTime("미정 ").state === "unknown" && parseTime("", "3(3)").state === "unknown" && parseTime("", "3(0)").state === "none", "미정·빈칸·시간 없음 구별");
ok(parseTime("월(11)").state === "unknown" && parseTime("토(0)").state === "ok", "11교시는 확인 필요, 0교시·토요일 허용");
ok(parseTime("수(1) 201호", "2(2)", "[강의시간] 수 1교시(09:00~10:55)").slots[0].end === 655, "비고의 실제 시간으로 넓힘(2교시와 겹침을 놓치지 않음)");
ok(JSON.stringify(parseTime("화(4-6) 323호<br>목(4-6) 323호", "3(3)", " 1:30-5:05/가정교육과 우선").slots.map((s) => [s.start, s.end])) === "[[810,1065],[810,1065]]", "12시간제 비고는 오후, 교시 범위 안이면 그대로");
ok(parseTime("수(1)", "1(1)", "*수업시작시간 9:30").state === "unknown" && parseTime("수(1)", "1(1)", "[강의시간] 목 1교시(09:00~10:55)").state === "unknown", "해석 못 하는 비고·요일 불일치는 확인 필요");
ok(JSON.stringify(splitProfs("정동혁,윤형철, <br>원종묵")) === '["정동혁","윤형철","원종묵"]' && splitProfs("전창현,손상영\r정동휘").length === 3, "공동강의 구분자");
{ const m = buildCourses([
    { COUR_CD: "X1", COUR_CLS: "02", COUR_NM: "가", CREDIT: "2.5", TIME_ROOM: "월(3)", PROF_NM: "a" },
    { COUR_CD: "X1", COUR_CLS: "01", COUR_NM: "가", CREDIT: "2.5", TIME_ROOM: "월(3) 101", PROF_NM: "b" },
    { COUR_CD: "X1", COUR_CLS: "03", COUR_NM: "가", CREDIT: "2.5", TIME_ROOM: "미정", PROF_NM: "c" },
    { COUR_CD: "Y1", COUR_CLS: "01", COUR_NM: "나", CREDIT: "3", TIME_ROOM: "화(1)" },
    { COUR_CD: "Y1", COUR_CLS: "02", COUR_NM: "나", CREDIT: "2", TIME_ROOM: "화(2)" }]);
  const x = m.get("X1");
  ok(x.credit === 2.5 && bundlesOf(x).length === 1 && bundlesOf(x)[0].cls.join() === "01,02", "소수 학점·같은 시간 묶기·미정 제외", bundlesOf(x));
  ok(blockReason(m.get("Y1")) === "학점 확인 필요" && blockReason(x, ["01", "02", "03"]) === "모든 분반 제외" && blockReason(x, ["01", "02"]) === "시간 확인 필요", "자동 후보 제외 사유"); }

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
