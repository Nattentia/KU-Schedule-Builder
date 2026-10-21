// 학기 정보. 판정기의 모든 날짜 계산은 이 객체 하나에서 나온다(연도·학기를 코드에 박지 않음).
// 날짜는 'YYYY-MM-DD' 문자열로 다룬다. 문자열 비교가 곧 날짜 비교다.

const pad = (n) => String(n).padStart(2, "0");
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** 존재하는 날짜면 'YYYY-MM-DD', 아니면 null (예: 9/31) */
export function isoIfValid(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(y, m, d) : null;
}

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 월=0 … 일=6 (Python date.weekday()와 같음) */
export function weekday(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const mmdd = (isoDate) => isoDate.slice(5).replace("-", "/");

/** 'YYYY-MM-DDTHH:MM' 한국 시간. 기기 시간대와 무관하게 학교 기준으로 판단하려고 쓴다. */
export const kstNow = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16);

/**
 * 계획할 학기(한국 날짜 기준): ~3/15 → 그해 1학기, ~9/15 → 그해 2학기, 그 뒤 → 다음 해 1학기.
 * 개강 직후(3월·9월 초)는 수강정정 기간이라 아직 그 학기를 계획한다.
 */
export function targetTerm(kst) {
  const y = Number(kst.slice(0, 4)), md = kst.slice(5, 10);
  return md <= "03-15" ? { year: y, code: "1R" } : md <= "09-15" ? { year: y, code: "2R" } : { year: y + 1, code: "1R" };
}

/**
 * @param {{year:number, code:string, start:string, midterm:[string,string], final:[string,string]}} t
 *   code: '1R' | '2R' | '1S' | '2W'. 날짜는 'YYYY-MM-DD'.
 */
export function makeTerm(t) {
  // 학기 달: 개강 달부터 기말 끝 달까지(겨울학기는 해를 넘김)
  const months = new Set();
  for (let d = t.start; d <= t.final[1]; d = addDays(d, 1)) months.add(Number(d.slice(5, 7)));
  // 계획서의 '월/일'에 붙일 연도: 개강 해, 단 개강 달보다 앞선 달이면 다음 해(겨울학기 1·2월)
  const startMonth = Number(t.start.slice(5, 7));
  const yearOf = (month) => (month < startMonth ? t.year + 1 : t.year);
  return { ...t, months, yearOf, cal: { midterm: t.midterm, final: t.final } };
}

/**
 * registrar 학사일정 HTML → 개강·중간·기말 날짜. 못 찾으면 null(호출자가 '학사일정 없음'을 표시).
 * 페이지 형식(2026-10 실측): 월 머리글 다음에 '20(화)~26(월) 제2학기 중간고사' 같은 줄.
 */
export function parseRegistrar(html, year, code) {
  const nth = { "1R": "1", "2R": "2" }[code];
  if (!nth) return null;
  // 표 행: [월 머리글(rowspan)] · 날짜 칸('1(화)', '24(월)~28(금)', '30(수)~10.2(금)') · 내용 칸
  const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  let month = null;
  const found = {};
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const mh = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    if (mh) { const mm = strip(mh[1]).match(/(\d{1,2})월/); if (mm) month = Number(mm[1]); }
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]));
    if (tds.length < 2 || !month) continue;
    const m = tds[0].match(/^(?:(\d{1,2})[.월]\s*)?(\d{1,2})일?\s*\([^)]*\)(?:\s*~\s*(?:(\d{1,2})[.월]\s*)?(\d{1,2})일?\s*\([^)]*\))?/);
    if (!m) continue;
    const m1 = Number(m[1] || month), d1 = Number(m[2]);
    const m2 = Number(m[3] || m1), d2 = Number(m[4] || d1);
    const what = tds.at(-1);
    // '2026학년도 제2학기 개강', '제2학기 중간고사'(연도 생략) 둘 다 있음. 다른 연도가 적힌 행만 뺀다.
    if (!what.includes(`제${nth}학기`) || (/학년도/.test(what) && !what.includes(`${year}학년도`))) continue;
    const y1 = year + (code === "1R" && m1 < 3 ? 1 : 0);
    const a = iso(y1, m1, d1), b = iso(y1 + (m2 < m1 ? 1 : 0), m2, d2);
    if (/개강/.test(what)) found.start = a;
    else if (/중간고사/.test(what)) found.midterm = [a, b];
    else if (/기말고사/.test(what)) found.final = [a, b];
  }
  return found.start && found.midterm && found.final ? makeTerm({ year, code, ...found }) : null;
}
