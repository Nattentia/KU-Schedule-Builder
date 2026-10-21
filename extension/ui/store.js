// 저장소 연결. 확장 안: chrome.storage(상태·판정 결과) + IndexedDB(학교 응답 캐시). 확장 밖(미리보기): localStorage.
import { apply } from "../src/state.js";

export const inExtension = Boolean(globalThis.chrome?.runtime?.id);

export async function getAll() {
  if (inExtension) return chrome.storage.local.get(null);
  return Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage[k])]));
}

export async function setKeys(obj) {
  if (inExtension) return chrome.storage.local.set(obj);
  for (const [k, v] of Object.entries(obj)) localStorage[k] = JSON.stringify(v);
  dispatchEvent(new Event("local-store"));
}

/** 상태 변경 명령. 확장 안에서는 background가 순서대로 반영한다. */
export async function send(term, op, args) {
  if (inExtension) {
    const r = await chrome.runtime.sendMessage({ type: "cmd", term, op, args });
    if (!r?.ok) throw new Error(r?.error || "저장 실패");
    return;
  }
  const key = `plan:${term}`;
  const cur = localStorage[key] ? JSON.parse(localStorage[key]) : undefined;
  await setKeys({ [key]: apply(cur, op, args) });
}

/** 변경 구독(다른 창의 변경 포함) */
export function watch(cb) {
  if (inExtension) chrome.storage.onChanged.addListener((_, area) => area === "local" && cb());
  else { addEventListener("local-store", cb); addEventListener("storage", cb); }
}

/** net.js용 캐시: IndexedDB 키-값 */
export function idbStore(name = "school-cache") {
  const db = new Promise((ok, fail) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  const tx = async (mode, fn) => { const s = (await db).transaction("kv", mode).objectStore("kv"); return new Promise((ok, fail) => { const q = fn(s); q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); }); };
  return { get: (k) => tx("readonly", (s) => s.get(k)), set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    keys: () => tx("readonly", (s) => s.getAllKeys()), del: (k) => tx("readwrite", (s) => s.delete(k)) };
}
