// 분반 하나: 계획서 수집 → 첨부 읽기 → 판정. 실패를 숨기지 않는다(분반마다 결과가 반드시 하나).
import { judge, WEEK_ROW_STRICT } from "./judge.js";
import { READERS, readPdf, readableText } from "./readers.js";
import { isoIfValid } from "./term.js";

// 공통 양식에서 판정에 쓰지 않는 칸(코드·번호·이름·비율·연락처)
const SKIP = /(Cd|Divcd|Yn|Uuid|Empno|Rto|syy|dvcno|sbjtnb|Nm|Hrs|cdt|lecTime|tb\d|Dt)$|^per001|^c\d/i;

/** 공통 양식 → units: 모든 문자열 칸 + 주차표(+ 시험 체크박스는 별도 표시) + 과제표 */
export function unitsFromPlan(p) {
  const units = [];
  const head = p.dsSles361?.[0] || {};
  for (const [k, v] of Object.entries(head)) {
    if (typeof v !== "string" || !v.trim() || SKIP.test(k) || v.length <= 3) continue;
    for (const line of v.split(/\r\n|\r|\n/)) if (line.trim()) units.push([line, { kind: "field", name: k }]);
  }
  for (const w of p.dsSles366 || []) {
    units.push([["lctreCtnt", "remrk", "lessnKernlCncptCtnt", "prjCtnt"].map((k) => String(w[k] ?? "")).join(" "), { kind: "week", n: w.lessnWkOdr }]);
    if (w.mdtexOprtYn === "1") units.push(["[중간고사 운영]", { kind: "week", n: w.lessnWkOdr, flag: true }]);
    if (w.fnlexOprtYn === "1") units.push(["[기말고사 운영]", { kind: "week", n: w.lessnWkOdr, flag: true }]);
  }
  for (const pj of p.dsSles372 || [])
    units.push([["prjNm", "wrtngMthdCtnt", "prstnMthdCtnt", "prstnClosDt"].map((k) => String(pj[k] ?? "")).join(" "), { kind: "field", name: "prj" }]);
  return units;
}

/** 과제표(dsSles372)의 마감일. 날짜 칸은 'YYYYMMDD'(실측). 이름이 'n/a'·'-'면 이름 없이 */
export function tasksOf(p) {
  return (p.dsSles372 || []).flatMap((pj) => {
    const m = String(pj.prstnClosDt ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
    const date = m && isoIfValid(+m[1], +m[2], +m[3]);
    const name = String(pj.prjNm ?? "").trim().replace(/^(n\/?a|-|없음)$/i, "").slice(0, 60);
    return date ? [{ name, date }] : [];
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * @param row 개설과목 한 행(lectHakbu)
 * @param {{net, term, pdfjs}} deps
 * @returns {{code, name, result, policy, quiz, alt, tasks, issues}}  tasks: 공통 양식 과제표의 마감일 [{name, date}]
 */
export async function analyzeSection(row, { net, term, pdfjs }) {
  const code = `${row.COUR_CD}-${row.COUR_CLS}`;
  let p;
  try { p = await net.plan(row); }
  catch (e) {
    const why = e.code === "BLOCKED" ? e.message : `수집 실패(${e.message}) · 다시 시도`;
    return { code, name: row.COUR_NM, result: [{ exam: "-", state: "!", why }], policy: [], quiz: [], alt: [], tasks: [], issues: [why] };
  }
  const units = unitsFromPlan(p);
  const issues = [];
  const uuid = p.dsSles361?.[0]?.attflUuid;
  if (uuid) {
    let att = { listed: 0, files: [] };
    try { att = await net.attachments(uuid); } catch (e) { issues.push(`첨부 수집 실패(${e.message})`); }
    if (!att.listed && !issues.length) issues.push("첨부 목록이 비어 있음");
    for (const f of att.files) {
      const short = f.name.slice(0, 20);
      if (f.problem) { issues.push(`${short}: ${f.problem}`); continue; }
      let lines = [];
      try {
        if (f.ext === "pdf") lines = await readPdf(f.bytes, pdfjs);
        else if (READERS[f.ext]) lines = await READERS[f.ext](f.bytes);
        else { issues.push(`${short}: 지원 안 하는 형식(.${f.ext})`); continue; }
      } catch (e) { issues.push(`${short}: 읽기 오류(${e.message})`); continue; }
      if (lines.length && !readableText(lines)) { issues.push(`${short}: 글자 깨짐`); lines = []; }
      else if (!lines.length) issues.push(`${short}: ${f.ext === "pdf" ? "텍스트 없음(스캔본)" : f.ext === "hwp" ? "배포용(암호) 문서" : "내용 없음"}`);
      for (const [t, page] of lines) units.push([t.normalize("NFC"), { kind: "file", page }]);
    }
  }
  const evl = p.dsSles364 || [];
  const hasWeekTable = (p.dsSles366 || []).length >= 8 || units.filter(([t, s]) => s.kind === "file" && WEEK_ROW_STRICT.test(t)).length >= 8;
  const hasContent = units.some(([, s]) => s.kind === "file" || s.kind === "week") || evl.length > 0;
  const { result, policy, quiz, alt } = judge(units, evl, hasWeekTable, hasContent, term);
  if (issues.length) {                                     // 첨부를 못 읽었으면 판정이 불완전함을 반드시 표시
    for (const x of result) if (["시험 없음", "계획서 없음", "정보 부족"].includes(x.state)) Object.assign(x, { state: "!", why: "첨부를 못 읽어 시험 여부 불확실" });
    result.push({ exam: "첨부", state: "!", why: `첨부 일부를 읽지 못함 · 원문 확인: ${issues.join("; ").slice(0, 120)}` });
  }
  return { code, name: row.COUR_NM, result, policy, quiz, alt, tasks: tasksOf(p), issues };
}
