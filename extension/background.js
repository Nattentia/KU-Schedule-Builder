// 확장 진입점 + 영속 상태의 단일 쓰기 경로. 네트워크 없음.
import { apply } from "./src/state.js";

// 사이드 패널이 없는 브라우저(웨일 등)에서는 아이콘을 누르면 플래너를 탭으로 연다.
if (chrome.sidePanel?.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
else chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: "ui/panel.html?full" }));
// 설치 직후 플래너를 한 번 열어 학교 일정표를 받아 둔다(일정표가 없으면 과목조회에 ☆를 붙이지 않음).
// 설치·업데이트 때 이미 열려 있는 학교 탭에 새 별 스크립트를 넣는다. 안 넣으면 그 탭의 옛 스크립트는 확장과 끊겨 새로고침 전까지 별이 안 눌린다.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: "ui/panel.html?full" });
  for (const { id } of await chrome.tabs.query({ url: "https://sugang.korea.ac.kr/*" }).catch(() => [])) {
    releaseZoom(id).catch(() => {});
    chrome.scripting.insertCSS({ target: { tabId: id }, files: ["ui/content.css"] }).catch(() => {});
    chrome.scripting.executeScript({ target: { tabId: id }, files: ["ui/content.js"] }).catch(() => {});
  }
});

const TERM = /^\d{4}-[12]R$/;
const FROM_SCHOOL_PAGE = new Set(["section"]);   // 학교 페이지(content script)는 분반 담기·취소만
let chain = Promise.resolve();

/**
 * 예전 버전이 사이드 패널 폭에 맞춰 학교 탭 배율을 그 탭만(per-tab) 낮춰 두었으면 원래(사이트 배율)로 돌린다.
 * 지금은 배율을 건드리지 않는다: 사이드 패널을 열어도 학교 페이지는 원래 비율 그대로이고 Ctrl+휠 확대도 사용자 몫(2026-10-21 사용자 결정).
 */
export async function releaseZoom(tabId) {
  if ((await chrome.tabs.getZoomSettings(tabId)).scope === "per-tab") await chrome.tabs.setZoomSettings(tabId, { scope: "per-origin" });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "cmd") return;
  const fromPage = sender.id !== chrome.runtime.id || (sender.url && !sender.url.startsWith(chrome.runtime.getURL("")));
  chain = chain.then(async () => {
    if (!TERM.test(msg.term)) throw new Error("잘못된 학기");
    if (fromPage && !FROM_SCHOOL_PAGE.has(msg.op)) throw new Error("허용되지 않은 요청");
    const key = `plan:${msg.term}`;
    const cur = (await chrome.storage.local.get(key))[key];
    const next = apply(cur, msg.op, msg.args);
    if (next !== cur) await chrome.storage.local.set({ [key]: next });
    return { ok: true };
  }).then(reply, (e) => reply({ ok: false, error: e.message }));
  return true;
});
