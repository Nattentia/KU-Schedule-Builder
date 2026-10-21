// 학기별 사용자 상태와 그 변경(순수 함수). 저장은 background 한 곳에서 이 함수들로만 한다.

export const emptyPlan = () => ({
  v: 1, courses: {}, bar: [], maxCredit: 18, favorites: [],
  view: { mode: "auto", autoKey: null, favKey: null }, picks: {},
});

export const COLORS = 12;
const CODE = /^[A-Z0-9]{3,12}$/i, CLS = /^[A-Z0-9]{1,4}$/i, PRI = ["need", "want", "spare"], LIST = /^\d{4}-[0-9A-Z]{1,3}$/;
const need = (cond, msg) => { if (!cond) throw new Error(`잘못된 요청: ${msg}`); };
const course = (p, code) => { need(CODE.test(code) && p.courses[code], `과목 ${code}`); return p.courses[code]; };
const without = (obj, k) => { const o = { ...obj }; delete o[k]; return o; };

// 각 op: (plan, args, now) → 새 plan. 인자는 여기서 검증한다(학교 페이지에서 온 명령도 같은 길을 지남).
export const OPS = {
  // from: 담을 때 본 과목 목록의 학기('2026-1R'). 신청 기간에 이전 학기 정보로 담은 과목을 가려내려고 기억한다
  add(p, { code, from }, now) {
    need(CODE.test(code) && (from === undefined || LIST.test(from)), `과목 ${code}`);
    if (p.courses[code]) return p;
    // 과목 색: 담을 때 한 번 정해 바꾸지 않는다(후보·목록·달력에서 같은 색). 쓰는 중인 색은 피한다.
    const used = new Set(Object.values(p.courses).map((c) => c.color));
    const color = [...Array(COLORS).keys()].find((i) => !used.has(i)) ?? Object.keys(p.courses).length % COLORS;
    // 새로 담음은 가장 최근 하나만: 앞서 담은 과목은 기본 중요도 그대로 목록으로 내려간다
    return { ...p, courses: { ...p.courses, [code]: { pri: "want", addedAt: now, excluded: [], color, ...(from && { from }) } }, bar: [code] };
  },
  // 담은 과목 한꺼번에 빼기(모두 비우기, 이전 학기 과목 지우기). 되돌리기는 restoreCourses
  removeMany(p, { codes }) {
    need(Array.isArray(codes) && codes.every((c) => CODE.test(c)), "과목 목록");
    const gone = new Set(codes.filter((c) => p.courses[c]));
    if (!gone.size) return p;
    const q = { ...p, courses: Object.fromEntries(Object.entries(p.courses).filter(([c]) => !gone.has(c))), bar: p.bar.filter((c) => !gone.has(c)) };
    return { ...q, picks: livePicks(q), gen: inputKey(q) };   // 후보도 바로 다시 만든다(열린 창 모두)
  },
  restoreCourses(p, { courses, bar }) {
    need(courses && typeof courses === "object" && Object.entries(courses).every(([code, c]) =>
      CODE.test(code) && PRI.includes(c?.pri) && Array.isArray(c?.excluded) && Number.isInteger(c?.color)), "되돌리기");
    const q = { ...p, courses: { ...p.courses, ...courses }, bar: Array.isArray(bar) && bar.length ? bar.filter((c) => courses[c] || p.courses[c]).slice(0, 1) : p.bar };
    return { ...q, gen: inputKey(q) };
  },
  // 지우면 후보도 바로 다시 만든다(지운 과목이 시간표·학수번호 복사에 남지 않게)
  remove(p, { code }) {
    course(p, code);
    const q = { ...p, courses: without(p.courses, code), bar: p.bar.filter((c) => c !== code) };
    return { ...q, picks: livePicks(q), gen: inputKey(q) };
  },
  // 과목조회 줄의 별 = 그 분반. 처음 담으면 그 분반만(only), 더 누르면 분반을 더하거나 뺀다. 마지막 분반을 빼면 과목도 뺀다.
  // from: 그 별이 있던 과목조회 목록의 학기('2026-1R'). 분반 번호는 학기마다 다른 수업이라, 고른 학기와 함께 기억한다.
  // 다른 학기 목록에서 다시 누르면 그 목록 기준으로 새로 고른다. 검색으로 과목째 담은 경우(only 없음)는 그 분반만 빼거나 되살린다.
  section(p, { code, cls, from }, now) {
    need(CODE.test(code) && CLS.test(cls) && (from === undefined || LIST.test(from)), `분반 ${code}-${cls}`);
    const c = p.courses[code];
    if (!c) { const q = OPS.add(p, { code, from }, now); return { ...q, courses: { ...q.courses, [code]: { ...q.courses[code], only: [cls], ...(from && { onlyFrom: from }) } } }; }
    if (!c.only) return OPS.exclude(p, { code, cls, off: !c.excluded.includes(cls) });
    if (from && c.onlyFrom && c.onlyFrom !== from)
      return { ...p, courses: { ...p.courses, [code]: { ...c, only: [cls], onlyFrom: from, excluded: c.excluded.filter((x) => x !== cls) } } };
    const on = sectionOn(c, cls, from);
    const only = on ? c.only.filter((x) => x !== cls) : [...new Set([...c.only, cls])];
    if (!only.length) return OPS.remove(p, { code });
    return { ...p, courses: { ...p.courses, [code]: { ...c, only, excluded: c.excluded.filter((x) => x !== cls) } } };
  },
  restore(p, { code, data, inBar }) {               // 삭제 되돌리기(지울 때처럼 후보도 다시 만든다)
    need(CODE.test(code) && PRI.includes(data?.pri) && Array.isArray(data?.excluded) && Number.isInteger(data?.color), "되돌리기");
    const q = { ...p, courses: { ...p.courses, [code]: data }, bar: inBar ? [code] : p.bar };
    return { ...q, gen: inputKey(q) };
  },
  setPri(p, { code, pri }) {                        // 순위 칩은 눌러서 돌리므로 바에 남긴다. 바는 후보 생성 때 비운다
    const c = course(p, code);
    need(PRI.includes(pri), `중요도 ${pri}`);
    return c.pri === pri ? p : { ...p, courses: { ...p.courses, [code]: { ...c, pri } } };
  },
  generate(p, { key }) {                            // 후보 생성: 바를 비우고 생성한 입력을 남겨 다른 창도 같이 다시 만든다
    need(typeof key === "string" && key.length < 100000, "후보 생성");
    return { ...p, bar: [], gen: key, picks: livePicks(p) };
  },
  // 새 학기 목록이 나왔을 때 연습(이전 학기 목록)으로 담은 과목 정리: 새 목록에 있는 과목(keep)은 학수번호를 그대로 두고
  // 분반 선택·뺀 분반만 지운다(학기가 다르면 같은 번호도 다른 수업). 새 목록에 없는 과목은 뺀다. 되돌리기는 restoreCourses
  rebase(p, { term, keep }) {
    need(LIST.test(term) && Array.isArray(keep) && keep.every((c) => CODE.test(c)), "새 학기로 옮기기");
    const old = new Set(oldCourses(p, term)), stay = new Set(keep);
    const courses = Object.fromEntries(Object.entries(p.courses).flatMap(([code, c]) => !old.has(code) ? [[code, c]]
      : stay.has(code) ? [[code, { pri: c.pri, addedAt: c.addedAt, excluded: [], color: c.color, from: term }]] : []));
    const q = { ...p, courses, bar: p.bar.filter((c) => courses[c]) };
    return { ...q, picks: livePicks(q), gen: inputKey(q) };
  },
  exclude(p, { code, cls, off }) {
    const c = course(p, code);
    need(CLS.test(cls), `분반 ${cls}`);
    const excluded = off ? [...new Set([...c.excluded, cls])] : c.excluded.filter((x) => x !== cls);
    const only = c.only && !off && !c.only.includes(cls) ? [...c.only, cls] : c.only;   // 고른 분반 밖을 되살리면 고른 목록에 더함
    return { ...p, courses: { ...p.courses, [code]: { ...c, excluded, ...(only && { only }) } } };
  },
  setMax(p, { value }) {
    need(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 60, `최대 학점 ${value}`);
    return { ...p, maxCredit: value };
  },
  view(p, { mode, autoKey, favKey }) {
    need(!mode || mode === "auto" || mode === "fav", `보기 ${mode}`);
    return { ...p, view: { ...p.view, ...(mode && { mode }), ...(autoKey !== undefined && { autoKey }), ...(favKey !== undefined && { favKey }) } };
  },
  pick(p, { candKey, code, cls }) {                 // 같은 분반을 다시 누르면 해제
    need(typeof candKey === "string" && CODE.test(code) && CLS.test(cls), "분반 선택");
    const cur = p.picks[candKey] ?? {};
    const next = cur[code] === cls ? without(cur, code) : { ...cur, [code]: cls };
    return { ...p, picks: Object.keys(next).length ? { ...p.picks, [candKey]: next } : without(p.picks, candKey) };
  },
  saveFav(p, { fav }, now) {
    need(typeof fav?.key === "string" && Array.isArray(fav.courses), "저장본");
    if (p.favorites.some((f) => f.key === fav.key)) return p;
    return { ...p, favorites: [{ ...fav, savedAt: now }, ...p.favorites], view: { ...p.view, favKey: fav.key } };
  },
  removeFav(p, { key }) { return { ...p, favorites: p.favorites.filter((f) => f.key !== key) }; },
  restoreFav(p, { fav }) {
    need(typeof fav?.key === "string" && fav.savedAt, "저장본 되돌리기");
    return p.favorites.some((f) => f.key === fav.key) ? p : { ...p, favorites: [fav, ...p.favorites].sort((a, b) => b.savedAt - a.savedAt) };
  },
};

export function apply(plan, op, args, now = Date.now()) {
  need(Object.hasOwn(OPS, op), `동작 ${op}`);
  return OPS[op](plan ?? emptyPlan(), args ?? {}, now);
}

/** 재계산이 필요한 입력만 담은 키(같은 값 중요도 누르기·보기 전환은 재계산하지 않음) */
export const inputKey = (p) => JSON.stringify([p.maxCredit, Object.entries(p.courses).map(([k, c]) => [k, c.pri, [...c.excluded].sort(), c.only ? [...c.only].sort() : null]).sort()]);

/** 후보별 분반 선택 중 지금 담은 과목으로만 이뤄진 후보의 것만 남긴다(후보 키 'CODE:시간|CODE:시간…') */
const livePicks = (p) => Object.fromEntries(Object.entries(p.picks)
  .filter(([key, v]) => Object.keys(v).length && key.split("|").every((part) => p.courses[part.split(":")[0]])));

/** 보고 있는 시간표 → 학수번호 복사용 줄 'KECE206 01 전자기학'(분반을 안 골랐으면 '01/02') */
export const codeLines = (courses) => courses.map((c) => `${c.code} ${c.pick ?? c.bundle.cls.join("/")} ${c.name}`);

/** 계획 학기(termId)가 아닌 학기 목록으로 담은 과목(이전 학기 정보로 연습 삼아 담은 것). 어디서 담았는지 모르면 이전 것으로 본다 */
export const oldCourses = (p, termId) => Object.entries(p.courses).filter(([, c]) => (c.onlyFrom ?? c.from) !== termId).map(([code]) => code);

/** 같은 시간 분반 묶음(cls)에서 고른 분반: 하나뿐이면 그것, 고른 것이 아직 묶음에 있으면 그것, 아니면(빼서 사라졌으면) 아직 안 고름 */
export const pickIn = (cls, pick) => (cls.length === 1 ? cls[0] : cls.includes(pick) ? pick : null);

/** 고른 분반이 이 학기 목록(term) 기준이면 그 목록, 다른 학기 목록에서 고른 것이면 null(번호가 다른 수업이라 쓰지 않음) */
export const pickedOnly = (c, term) => (c?.only && (!c.onlyFrom || !term || c.onlyFrom === term) ? c.only : null);

/** 후보에서 뺄 분반: 이 학기 목록(dataTerm)에서 고른 분반이 있으면 그 밖의 분반 전부 + 직접 뺀 분반 */
export const offOf = (c, allCls, dataTerm) => {
  const only = pickedOnly(c, dataTerm);
  return only ? [...new Set([...allCls.filter((x) => !only.includes(x)), ...c.excluded])] : c?.excluded ?? [];
};

/** 과목조회 줄의 별이 켜져 있나: 지금 보는 목록(listTerm)에서 그 분반이 담겨 있으면 */
export const sectionOn = (c, cls, listTerm) => {
  if (!c) return false;
  if (!c.only) return !c.excluded.includes(cls);
  const only = pickedOnly(c, listTerm);
  return Boolean(only && only.includes(cls) && !c.excluded.includes(cls));
};

/** 저장본 키: 과목·시간 묶음·분반 선택 */
export const favKey = (candKey, picks = {}) => `${candKey}#${Object.entries(picks).sort().map(([c, s]) => `${c}=${s}`).join(",")}`;

/** 목록 배치: 새로 담은 과목 바 / 현재 시간표의 과목 / 나머지. 그룹 안은 최근 담은 순. */
export function listing(p, inView, savedOrder = null) {
  const recent = (a, b) => (p.courses[b]?.addedAt ?? 0) - (p.courses[a]?.addedAt ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
  const rest = Object.keys(p.courses).filter((c) => !p.bar.includes(c)).sort(recent);
  return {
    bar: p.bar.filter((c) => p.courses[c]),
    included: savedOrder ? savedOrder.filter((c) => !p.bar.includes(c)) : rest.filter((c) => inView.has(c)),
    excluded: rest.filter((c) => !inView.has(c)),
  };
}
