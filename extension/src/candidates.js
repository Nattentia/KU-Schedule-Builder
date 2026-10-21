// 시간표 후보 생성·정렬 (CANDIDATE_PROBLEM.md §2~4). 순수 함수, 결과를 자르지 않는다.

export const overlap = (a, b) => a.some((x) => b.some((y) => x.day === y.day && x.start < y.end && y.start < x.end));

const coll = new Intl.Collator("ko", { numeric: true, sensitivity: "variant" });
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpList = (a, b, cmp) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = cmp(a[i], b[i]); if (d) return d; }
  return a.length - b.length;
};

/**
 * @param courses [{code, name, pri:'need'|'want'|'spare', credit, bundles:[{key, slots, cls}]}] — 후보에 들 수 있는 과목만
 * @param maxCredit 최대 학점(0 이상)
 * @returns {{M:number, list:[{key, picks:[{code,name,pri,credit,bundle}], want, credits}]}}
 */
export function generate(courses, maxCredit) {
  const byCode = (a, b) => byStr(a.code, b.code);
  const need = courses.filter((c) => c.pri === "need").sort(byCode);
  const rest = courses.filter((c) => c.pri !== "need").sort(byCode);   // 입력 순서와 무관하게(E18)
  const all = [...need, ...rest];
  const chosen = [];
  let credits = 0;
  const fits = (c, b) => credits + c.credit <= maxCredit && !chosen.some((x) => overlap(x.bundle.slots, b.slots));
  const push = (c, b) => { chosen.push({ ...c, bundle: b }); credits += c.credit; };
  const pop = () => { credits -= chosen.pop().credit; };

  // 1) 시간·학점을 지키며 넣을 수 있는 필수 과목 수의 최댓값 M
  let M = 0;
  (function best(i, n) {
    if (n + need.length - i <= M) return;
    if (i === need.length) { M = n; return; }
    const c = need[i];
    for (const b of c.bundles) if (fits(c, b)) { push(c, b); best(i + 1, n + 1); pop(); }
    best(i + 1, n);
  })(0, 0);

  // 2) 필수가 정확히 M개인 조합마다 되면·여유를 넣기/빼기, 3) 더 채울 수 있는 후보는 버림
  const list = [];
  const maximal = () => all.every((c) => chosen.some((x) => x.code === c.code) || !c.bundles.some((b) => fits(c, b)));
  (function walk(i, n) {
    if (i <= need.length && n + need.length - i < M) return;
    if (i === all.length) { if (chosen.length && maximal()) list.push(make(chosen, credits)); return; }   // 빈 조합은 후보가 아니다
    const c = all[i];
    for (const b of c.bundles) if (fits(c, b)) { push(c, b); walk(i + 1, n + (i < need.length)); pop(); }
    walk(i + 1, n);
  })(0, 0);

  // 4) 되면 수 → 총학점 → 과목명 목록 → 학수번호 목록 → 수업 시간 목록
  list.sort((a, b) => b.want - a.want || b.credits - a.credits
    || cmpList(a.names, b.names, coll.compare) || cmpList(a.codes, b.codes, byStr) || cmpList(a.times, b.times, byStr));
  for (const c of list) { delete c.names; delete c.codes; delete c.times; }
  return { M, list };
}

function make(chosen, credits) {
  const picks = chosen.map(({ code, name, pri, credit, bundle }) => ({ code, name, pri, credit, bundle }))
    .sort((a, b) => coll.compare(a.name.normalize("NFC"), b.name.normalize("NFC")) || byStr(a.code, b.code));
  const byCode = [...picks].sort((a, b) => byStr(a.code, b.code));
  return {
    key: byCode.map((p) => `${p.code}:${p.bundle.key}`).join("|"),
    picks, credits,
    want: picks.filter((p) => p.pri === "want").length,
    names: picks.map((p) => p.name.normalize("NFC")),
    codes: byCode.map((p) => p.code),
    times: byCode.map((p) => p.bundle.key),
  };
}
