// 학교 서버 요청은 전부 이 파일의 gate 하나를 지난다: 캐시 우선 · 순차 1개 · 0.5초 간격 · 수강신청 기간 차단.
// fetch와 저장소는 주입받는다(크롬: fetch + IndexedDB, Node 테스트: fetch + Map).

import { kstNow } from "./term.js";

const SUGANG = "https://sugang.korea.ac.kr";
const AMS = "https://ams.korea.ac.kr";
const REGISTRAR = "https://registrar.korea.ac.kr";
const FORM = { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" };
const MENU = { _menuId: "MzMzODYzMjY=", _menuNm: "", _pgmId: "MTg3NDA2" };
// 첨부 다운로드 토큰: 공식 페이지 JS(ams/ui/cpr-lib/user-modules.js, Submission._encode)와 같은 계산
const KEY = "f338385b39b3bd475074a127ff3389e3", IV = "85b58bd6779597a1a495821f0ba4b0a9";
const MAGIC = { pdf: [[0x25, 0x50, 0x44, 0x46]], hwp: [[0xd0, 0xcf, 0x11, 0xe0]], doc: [[0xd0, 0xcf, 0x11, 0xe0]],
  docx: [[0x50, 0x4b, 0x03, 0x04]], hwpx: [[0x50, 0x4b, 0x03, 0x04]] };

const hex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const form = (o) => new URLSearchParams(o).toString();

/** 공식 JS와 같은 토큰: base64(AES-128-CBC(PKCS7)( "{now}^[this]^{b64(urlenc(v))}^[this]^{now+186400000}" )) */
export async function encodeToken(value, now) {
  const inner = b64(new TextEncoder().encode(encodeURIComponent(String(value))));
  const plain = new TextEncoder().encode(`${now}^[this]^${inner}^[this]^${now + 186400 * 1000}`);
  const key = await crypto.subtle.importKey("raw", hex(KEY), "AES-CBC", false, ["encrypt"]);
  return b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: hex(IV) }, key, plain)));
}

/**
 * sugang 일정 표(POST /p/l/loginPage) → 수강신청·정정 기간 [[시작, 끝]] ('YYYY-MM-DDTHH:MM', 한국 시간).
 * 수강희망 담기·관심과목 담기는 막지 않는다(계획을 세우는 시기). 구분 칸이 rowspan이면 앞 행의 구분을 이어 쓴다.
 */
export function parseRegistrationWindows(html) {
  const out = [];
  let label = "";
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>|\s+/g, " ").trim());
    const span = cells.join(" ").match(/(\d{4})-(\d{2})-(\d{2})\(.\)\s*(\d{2}:\d{2})\s*~\s*(\d{2})-(\d{2})\(.\)\s*(\d{2}:\d{2})/);
    if (!span) continue;
    if (cells.length >= 3) label = cells[0];
    if (!/^수강신청/.test(label)) continue;
    const [, y, m1, d1, t1, m2, d2, t2] = span;
    out.push([`${y}-${m1}-${d1}T${t1}`, `${Number(m2) < Number(m1) ? Number(y) + 1 : y}-${m2}-${d2}T${t2}`]);
  }
  return out;
}

/**
 * @param {{fetch: Function, store: {get(k):Promise<any>, set(k,v):Promise<void>}, now?: () => Date}} deps
 */
export function createNet({ fetch, store, now = () => new Date() }) {
  let last = 0, chain = Promise.resolve(), windows = null, serverNow = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const kst = () => kstNow(now().getTime());

  /** 모든 요청의 단일 관문 */
  function gate(cacheKey, ttlDays, doFetch) {
    const run = async () => {
      const hit = await store.get(cacheKey);
      if (hit && (ttlDays === Infinity || now().getTime() - hit.at < ttlDays * 864e5)) return hit.v;
      if (windows && windows.some(([a, b]) => a <= kst() && kst() <= b)) {
        if (hit) return hit.v;                                      // 기간 중엔 오래된 캐시라도 쓴다
        throw Object.assign(new Error("수강신청 기간에는 학교 서버에 접속하지 않습니다"), { code: "BLOCKED" });
      }
      const wait = 500 - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      let v;
      try { v = await doFetch(); }
      catch (e) { if (hit) return hit.v; throw e; }               // 인터넷이 끊겼으면 오래된 캐시라도 쓴다(작년 목록으로 잘못 넘어가지 않게)
      await store.set(cacheKey, { at: now().getTime(), v });
      return v;
    };
    const p = chain.then(run, run);                                 // 순차 1개
    chain = p.catch(() => {});
    return p;
  }

  const postJson = async (url, body) => {
    const r = await fetch(url, { method: "POST", headers: FORM, body: form(body) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  };

  return {
    /** 수강신청·정정 기간을 읽어 둔다. 이후 모든 요청은 이 기간에 막힌다. */
    async loadSchedule() {
      // 캐시에 일정이 있으면 먼저 알아 둔다: 기간 중에 캐시(1일)가 지나도 다시 받지 않고 옛 일정을 쓰게
      if (!windows) { const hit = await store.get("schedule"); if (hit?.v) windows = parseRegistrationWindows(hit.v); }
      const html = await gate("schedule", 1, async () => (await fetch(`${SUGANG}/p/l/loginPage?fake=${Date.now()}`,
        { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } })).text());
      windows = parseRegistrationWindows(html);
      return windows;
    },
    /** 학사일정 HTML. 기본은 현재 학기 화면, q='?cYear=..&hakGi=..&srCategoryId1=..'는 그 페이지의 학기선택과 같은 요청 */
    registrarHtml: (q = "") => gate(`registrar${q}`, 1, async () => (await fetch(REGISTRAR + "/eduinfo/affairs/schedule.do" + q)).text()),

    /** 개설과목 전체(이수구분 6종) */
    async catalog(year, termCode) {
      const rows = new Map();
      for (const div of ["00", "24", "01", "30", "41", "71"]) {
        const res = await gate(`lect:${year}${termCode}:${div}`, 1, () => postJson(`${SUGANG}/d/v/lectHakbu?fake=${Date.now()}`, {
          pYear: year, pTerm: termCode, pCampus: "1", pGradCd: "0136", pCourDiv: div, pCol: "", pDept: "", pCredit: "", pDay: "",
          pStartTime: "", pEndTime: "", pProf: "", pCourCd: "", pCourNm: "", strYear: year, strTerm: termCode }));
        if (res.code !== "200") throw Object.assign(new Error(res.message || "목록 조회 실패"), { code: res.code });
        for (const x of res.rows) rows.set(x.PARAMS, x);
      }
      return [...rows.values()];
    },

    /** 계획서 1건(주차표·평가표·과제·첨부 정보가 모두 이 응답에 있음) */
    plan(r) {
      const body = { ...MENU, "@d#": "@d1#", "@d1#": "dmCond", "@d1#tp": "dm" };
      for (const [k, v] of Object.entries({ syy: r.YEAR, smtDivcd: r.TERM, faclyGschDeptCd: r.GRAD_CD, estblDeprtCd: r.DEPT_CD,
        sbjtnb: r.COUR_CD, dvcno: r.COUR_CLS, locale: "ko", sysUseUnitDivcd: "A0136" })) body["@d1#" + k] = v;
      return gate(`plan:${r.YEAR}${r.TERM}:${r.PARAMS}`, 7, () => postJson(`${AMS}/sch/sles/SleslcCtr/findAllLctreSyllaPopLrnPlanList.do`, body));
    },

    /** 첨부 목록 + 본문. [{name, ext, bytes|null, problem|null}] — 잘못 받은 파일은 1회 다시 받는다. */
    async attachments(uuid) {
      const list = (await gate(`flist:${uuid}`, 7, () => postJson(`${AMS}/com/cmsv/FileCtr/findFileDetailList.do`, { attflUuid: uuid, ...MENU }))).dsCsys401 || [];
      const out = [];
      for (const f of list) {
        const name = f.fileNm.normalize("NFC"), ext = name.split(".").pop().toLowerCase();
        let bytes = null, problem = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          bytes = await gate(`file:${uuid}:${f.attflSeqno}`, attempt ? 0 : Infinity, async () => {
            if (!serverNow || attempt) serverNow = (await postJson(`${AMS}/com/cnst/PropCtr/findCurrTimeMillis.do`, {}))._METADATA_.curr;
            const r = await fetch(`${AMS}/com/cmsv/FileCtr/fileDefaultDownload.do`, { method: "POST", headers: FORM,
              body: form({ attflUuid: await encodeToken(uuid, serverNow), attflSeqno: await encodeToken(f.attflSeqno, serverNow), menuId: "33386326" }) });
            return new Uint8Array(await r.arrayBuffer());
          });
          problem = validFile(bytes, ext, f.fileSize);
          if (!problem) break;
          await store.set(`file:${uuid}:${f.attflSeqno}`, null);       // 잘못 받은 파일은 캐시에서 지운다
        }
        out.push({ name, ext, bytes: problem ? null : bytes, problem });
      }
      return { listed: list.length, files: out };
    },
  };
}

/**
 * 학교 응답 캐시를 학기 단위로 정리한다(학교 서버 요청 없음).
 * 지금 쓰는 학기(keepTerms: 계획 학기와 그 목록 학기, 예 ['20271R', '20261R']) 밖의 과목 목록·계획서는 지우고,
 * 남은 계획서가 가리키지 않는 첨부(목록·파일)도 지운다. 학기가 바뀌면 지난 학기 첨부 원본이 함께 사라진다.
 * @returns 지운 항목 수
 */
export async function pruneCache(store, keepTerms) {
  const keys = await store.keys();
  const termOf = (k) => k.match(/^(?:lect|plan):(\d{4}[0-9A-Z]{1,3}):/)?.[1];
  const gone = keys.filter((k) => termOf(k) && !keepTerms.includes(termOf(k)));
  const live = new Set();
  for (const k of keys) if (k.startsWith("plan:") && !gone.includes(k)) {
    const uuid = (await store.get(k))?.v?.dsSles361?.[0]?.attflUuid;
    if (uuid) live.add(uuid);
  }
  for (const k of keys) { const m = k.match(/^(?:flist|file):([^:]+)/); if (m && !live.has(m[1])) gone.push(k); }
  for (const k of gone) await store.del(k);
  return gone.length;
}

/**
 * 계획할 학기의 과목 목록을 고른다. 그 학기 목록이 아직 없으면(오류·빈 목록) 작년 같은 학기 목록.
 * 수강신청 기간이라 받을 수 없고 캐시도 없으면 빈 목록(blocked).
 * @returns {{rows: object[], year: number, lastYear: boolean, blocked?: boolean}}
 */
export async function pickCatalog(net, { year, code }) {
  try {
    const rows = await net.catalog(year, code);
    if (rows.length) return { rows, year, lastYear: false };
  } catch (e) {
    if (e.code === "BLOCKED") return { rows: [], year, lastYear: false, blocked: true };
  }
  try { return { rows: await net.catalog(year - 1, code), year: year - 1, lastYear: true }; }
  catch (e) { return { rows: [], year: year - 1, lastYear: true, blocked: e.code === "BLOCKED" }; }
}

/** 받은 파일이 확장자 형식·목록 크기(KB)와 맞는지. 문제가 있으면 사유 문자열. */
export function validFile(bytes, ext, sizeKb) {
  if (MAGIC[ext] && !MAGIC[ext].some((m) => m.every((b, i) => bytes[i] === b))) return "형식 불일치(오류 페이지 등)";
  if (sizeKb && Math.abs(bytes.length / 1024 - sizeKb) > Math.max(2, sizeKb * 0.1)) return `크기 불일치(${Math.round(bytes.length / 1024)}KB/${sizeKb}KB)`;
  return null;
}
