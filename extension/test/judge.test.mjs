// 판정 회귀 테스트(네트워크·계획서 원문 없이 돈다). 계획서에 흔한 표기 형식을 본떠 지어낸 문장과 기대 판정.
// 실행: node test/judge.test.mjs
import { judge } from "../src/judge.js";
import { makeTerm } from "../src/term.js";
import { tasksOf } from "../src/syllabus.js";

const term = makeTerm({ year: 2026, code: "2R", start: "2026-09-01", midterm: ["2026-10-20", "2026-10-26"], final: ["2026-12-14", "2026-12-18"] });
const F = (...ls) => ls.map((l) => [l, { kind: "file" }]);
const W = (n, t, flag = false) => [t, { kind: "week", n, ...(flag ? { flag: true } : {}) }];
const E = (...kv) => kv.map(([k, v]) => ({ evlItemCtnt: k, evlSco: v }));

const CASES = [  // [이름, units, 평가표, 시험키, 기대 상태, 기대 날짜?]
  ["요일까지 명시된 강의시간 밖 시험", F("8주 | 10/24(토) | 중간시험 : | 10시~11시30분"), E(["중간시험", 40]), "midterm", "확정", "2026-10-24"],
  ["끝 시각의 분까지", F("8주 | 10/24(토) | 중간시험 : | 10시~11시30분"), E(["중간시험", 40]), "midterm", "확정", "2026-10-24", "10시~11시30분"],
  ["표 행: 날짜가 앞 칸", F("8 | 10/22  중간고사 시험"), E(["중간고사", 30]), "midterm", "확정", "2026-10-22"],
  ["단독 시각", F("10/13 ~ 10/17 | 10월 21일(수) : 중간고사(9:30)"), E(["중간고사", 40]), "midterm", "확정", "2026-10-21"],
  ["과목 자체 기간", F("15 | 기말고사 | (12월 10일-16일)"), E(["기말고사", 100]), "final", "기간", "12/10~12/16"],
  ["주차표+평가표", [W(8, "중간고사"), W(8, "[중간고사 운영]", true)], E(["중간고사", 30]), "midterm", "기간"],
  ["평가표만, 일정 없음", F("개요"), E(["기말고사", 40]), "final", "예상"],
  ["15주차 기재", F("15 | 기말고사(인터뷰)"), E(["기말시험", 30]), "final", "주차", "12/08~12/14"],
  ["tentative", F("Final exam | 50 % | Dec. 15 | (tentative)"), [], "final", "!"],
  ["날짜 후보 여러 개", F("8 | 10/20(화), 22(목) | 중간고사"), E(["중간고사", 30]), "midterm", "!"],
  ["평가표 '또는'", F("개요"), E(["중간고사(또는 대체과제)", 30]), "midterm", "!"],
  ["평가표 항목명에 시험 단어 없음", F("Final 50 %"), [], "final", "!"],
  ["중간평가(작품)", F("중간고사(30점): 과정기록 15점, 완성결과 15점"), E(["중간평가", 30]), "midterm", "!"],
  ["평가표 시험 vs 본문 대체", F("- 중간고사는 지필고사, 기말고사는 과제로 대체함."), E(["기말고사", 20]), "final", "!"],
  ["앞 절의 대체는 무관", F("중간고사는 레포트 대체, 기말시험은 대면", "16 | 기말고사"), E(["기말시험", 50]), "final", "기간"],
  ["나열 속 다른 항목(발표)", F("중간/기말고사 필기 시험, 발표 및 퀴즈", "16 | 기말고사"), E(["기말고사", 40]), "final", "기간"],
  ["보충 주간", F("8 | 10. 20(화) | 중간 고사 보충 주간 | 강의"), E(["중간 고사", 20]), "midterm", "!"],
  ["주차표와 체크박스 불일치", [W(12, "중간고사 지필고사"), W(8, "[중간고사 운영]", true)], E(["중간고사", 20]), "midterm", "!"],
  ["영어 날짜", F("Midterm Exam (10/26)", "Final Exam (12/16)"), E(["Midterm Exam", 40]), "midterm", "확정", "2026-10-26"],
];
const NONE = [
  ["없음 명시", F("중간고사 및 기말고사는 없음."), []],
  ["replace", F("A portfolio replaces the mid-term and final exams."), []],
  ["배점 '-'과 0", F("3 | 중간고사 | 0", "4 | 기말고사 | 0", "8 | No Class (mid-term exam period)"), []],
];

let bad = 0;
for (const [name, units, ev, key, want, date, time] of CASES) {
  const got = judge(units, ev, true, true, term).result.find((x) => x.exam === key);
  const ok = got?.state === want && (!date || got.date === date) && (!time || got.time === time);
  bad += !ok;
  console.log(ok ? "OK  " : "FAIL", name, got ? `${got.state} ${got.date ?? ""}` : "(없음)");
}
for (const [name, units, ev] of NONE) {
  const got = judge(units, ev, true, true, term).result.map((x) => x.state);
  const ok = JSON.stringify(got) === '["시험 없음"]';
  bad += !ok;
  console.log(ok ? "OK  " : "FAIL", name, got.join(","));
}
// 대체: 대신할 평가를 말할 때만(없음·0%는 대체 아님) / 퀴즈: 곁 날짜가 하나일 때만 날짜
const EXTRA = [
  ["평가표 과제 대체", F("개요"), E(["중간고사(과제 대체)", 30], ["기말고사", 40]), (r) => r.alt.map((a) => `${a.exam}:${a.label}`).join() === "midterm:과제 대체"],
  ["본문 replace", F("A portfolio replaces the mid-term and final exams."), [], (r) => r.alt.some((a) => a.exam === "midterm" && a.label.endsWith("대체"))],
  ["없음은 대체 아님", F("개요"), E(["중간고사 없음", 0], ["기말고사", 40]), (r) => !r.alt.length],
  ["퀴즈 날짜 하나", F("10/14(수) 퀴즈 1", "매주 퀴즈 실시"), E(["기말고사", 40]), (r) => r.quiz.map((q) => q.date ?? "-").join() === "2026-10-14,-"],
  ["퀴즈 날짜 여럿은 날짜 없음", F("퀴즈 10/14, 10/21"), E(["기말고사", 40]), (r) => r.quiz.length === 1 && !r.quiz[0].date],
  ["시험 줄의 퀴즈는 날짜 안 씀", F("10/22 중간고사(퀴즈 형식)"), E(["중간고사", 40]), (r) => !r.quiz.some((q) => q.date)],
];
for (const [name, units, ev, check] of EXTRA) {
  const r = judge(units, ev, true, true, term), ok = check(r);
  bad += !ok;
  console.log(ok ? "OK  " : "FAIL", name, ok ? "" : JSON.stringify({ alt: r.alt, quiz: r.quiz }));
}
{ const t = tasksOf({ dsSles372: [{ prjNm: "n/a", prstnClosDt: "20261102" }, { prjNm: " 보고서 ", prstnClosDt: "20260923" }, { prjNm: "x", prstnClosDt: "2026-09" }, { prjNm: "y", prstnClosDt: "20260931" }] });
  const ok = JSON.stringify(t) === '[{"name":"보고서","date":"2026-09-23"},{"name":"","date":"2026-11-02"}]';
  bad += !ok; console.log(ok ? "OK  " : "FAIL", "과제 마감: YYYYMMDD만, 없는 날짜·형식 빼고 날짜순", ok ? "" : JSON.stringify(t)); }
console.log(`실패 ${bad} / ${CASES.length + NONE.length + EXTRA.length + 1}`);
process.exit(bad ? 1 : 0);
