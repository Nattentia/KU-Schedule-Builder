// background.js를 가짜 chrome으로 불러 확인: 사이드 패널 유무에 따른 아이콘 동작, 학교 페이지 명령 제한. 실행: node test/background.test.mjs
let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };

function fakeChrome({ sidePanel }) {
  const store = {}, calls = { behavior: null, actionClick: null, tabs: [], onMessage: null, installed: null, injected: [] };
  globalThis.chrome = {
    runtime: { id: "ext", getURL: (p) => `chrome-extension://ext/${p}`, onInstalled: { addListener: (f) => (calls.installed = f) }, onMessage: { addListener: (f) => (calls.onMessage = f) } },
    storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } },
    tabs: { create: (o) => calls.tabs.push(o.url), query: async ({ url }) => (url === "https://sugang.korea.ac.kr/*" ? [{ id: 7 }] : []) },
    scripting: { insertCSS: async (o) => calls.injected.push(`css:${o.target.tabId}:${o.files}`), executeScript: async (o) => calls.injected.push(`js:${o.target.tabId}:${o.files}`) },
    action: { onClicked: { addListener: (f) => (calls.actionClick = f) } },
    ...(sidePanel && { sidePanel: { setPanelBehavior: async (b) => { calls.behavior = b; } } }),
  };
  return { calls, store };
}
const send = (calls, msg, sender) => new Promise((r) => calls.onMessage(msg, sender, r));

{ const { calls } = fakeChrome({ sidePanel: true });
  await import("../background.js?with");
  ok(calls.behavior?.openPanelOnActionClick === true && !calls.actionClick, "사이드 패널 있으면 아이콘 → 패널");
  await calls.installed({ reason: "update" });
  ok(calls.injected.join() === "css:7:ui/content.css,js:7:ui/content.js" && !calls.tabs.length, "업데이트: 열린 학교 탭에 별 스크립트 다시 넣기, 플래너 탭은 안 엶", calls); }
{ const { calls, store } = fakeChrome({ sidePanel: false });
  await import("../background.js?without");
  ok(typeof calls.actionClick === "function", "사이드 패널 없으면 아이콘 리스너 등록");
  calls.actionClick();
  ok(calls.tabs[0] === "ui/panel.html?full", "아이콘 → 플래너 탭", calls.tabs);
  const page = { id: "ext", url: "https://sugang.korea.ac.kr/" }, ext = { id: "ext", url: "chrome-extension://ext/ui/panel.html" };
  ok((await send(calls, { type: "cmd", term: "2027-1R", op: "section", args: { code: "COSE213", cls: "02" } }, page)).ok && store["plan:2027-1R"].courses.COSE213.only.join() === "02", "학교 페이지: 분반 담기 허용");
  ok(!(await send(calls, { type: "cmd", term: "2027-1R", op: "remove", args: { code: "COSE213" } }, page)).ok, "학교 페이지: 과목째 빼기는 거부");
  ok(!(await send(calls, { type: "cmd", term: "2027-1R", op: "setMax", args: { value: 3 } }, page)).ok, "학교 페이지: 그 밖의 명령 거부");
  ok((await send(calls, { type: "cmd", term: "2027-1R", op: "setMax", args: { value: 15 } }, ext)).ok && store["plan:2027-1R"].maxCredit === 15, "확장 화면: 명령 허용");
  ok(!(await send(calls, { type: "cmd", term: "../x", op: "add", args: { code: "COSE213" } }, ext)).ok, "잘못된 학기 거부"); }

// 학교 탭 배율: 예전 버전이 그 탭만(per-tab) 바꿔 둔 배율은 사이트 배율로 되돌리고, 사용자 배율(per-origin)은 건드리지 않음
{ const { releaseZoom } = await import("../background.js?with");
  const tab = { scope: "per-tab" }; let sets = 0;
  chrome.tabs.getZoomSettings = async () => ({ scope: tab.scope });
  chrome.tabs.setZoomSettings = async (_, o) => { tab.scope = o.scope; sets++; };
  await releaseZoom(7);
  ok(tab.scope === "per-origin" && sets === 1, "예전 버전의 per-tab 배율 → 사이트 배율로", tab);
  await releaseZoom(7);
  ok(sets === 1, "이미 사이트 배율이면 그대로", { sets }); }

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
