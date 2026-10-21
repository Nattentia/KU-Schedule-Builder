// 시간표 배치(lanes)와 빈 칸 검색(fitsAt). 실행: node test/layout.test.mjs
import { lanes } from "../ui/timetable.js";
import { buildCourses, fitsAt } from "../src/catalog.js";

let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };
const L = (items) => lanes(items).map((x) => `${x.lane}/${x.lanes}`).join(" ");
const it = (day, start, end, kind = "blk") => ({ day, start, end, kind });

ok(L([it(0, 540, 615), it(0, 630, 705)]) === "0/1 0/1", "안 겹치면 한 줄씩 폭 전체", L([it(0, 540, 615), it(0, 630, 705)]));
ok(L([it(0, 540, 615), it(0, 540, 615)]) === "0/2 1/2", "같은 시간 둘 → 반씩", L([it(0, 540, 615), it(0, 540, 615)]));
ok(L([it(0, 540, 615), it(0, 540, 615), it(0, 540, 615)]) === "0/3 1/3 2/3", "같은 시간 셋 → 3등분");
ok(L([it(0, 540, 615), it(1, 540, 615)]) === "0/1 0/1", "요일이 다르면 따로");
// 무리: A(9~11) B(10~12)가 겹치고, C(13~14)는 따로 → C는 폭 전체
ok(L([it(0, 540, 660), it(0, 600, 720), it(0, 780, 840)]) === "0/2 1/2 0/1", "겹침 무리마다 따로 나눔");
// 사슬: A(9~10) B(9:30~11) C(10~11:30): A가 끝난 자리에 C → 두 줄
ok(L([it(0, 540, 600), it(0, 570, 660), it(0, 600, 690)]) === "0/2 1/2 0/2", "끝난 줄을 다시 씀");
// 시간표 칸이 미리보기보다 왼쪽 줄(입력 순서와 무관)
ok(L([it(0, 540, 615, "pv"), it(0, 540, 615, "blk")]) === "1/2 0/2", "시간표 칸이 왼쪽");
ok(lanes([]).length === 0, "빈 입력");

const R = (code, cls, time) => ({ COUR_CD: code, COUR_CLS: cls, COUR_NM: code, PROF_NM: "김", TIME_ROOM: time, TIME: "3(3)", CREDIT: 3 });
const cs = buildCourses([R("A", "01", "월(3) X<br>수(3) X"), R("A", "02", "월(5) X<br>수(5) X"), R("B", "01", "미정"), R("C", "01", "화(3) X")]);
const busy = [{ day: 2, start: 720, end: 795 }];                               // 수 3교시가 이미 참
ok(fitsAt(cs.get("A"), 0, 900, busy).join() === "02", "월 15:00: 02분반만, 수 3교시와 안 겹침", fitsAt(cs.get("A"), 0, 900, busy));
ok(fitsAt(cs.get("A"), 0, 720, busy).join() === "", "월 12:00 분반(01)은 수 3교시와 겹쳐 제외");
ok(fitsAt(cs.get("A"), 0, 720, []).join() === "01", "겹칠 것이 없으면 01");
ok(fitsAt(cs.get("A"), 0, 900, [], ["02"]).join() === "", "뺀 분반은 제외");
ok(fitsAt(cs.get("B"), 0, 720, []).length === 0, "시간 미정은 제외");
ok(fitsAt(cs.get("A"), 0, 795, []).join() === "", "끝나는 시각은 수업 밖(12:00~13:15의 13:15)");
ok(fitsAt(cs.get("C"), 0, 720, []).length === 0, "다른 요일은 제외");

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
