// 후보 계산 전용 워커: 후보 수 상한이 없으므로 계산이 화면 입력을 막지 않게 한다.
import { generate } from "../src/candidates.js";

onmessage = ({ data: { id, courses, maxCredit } }) => postMessage({ id, ...generate(courses, maxCredit) });
