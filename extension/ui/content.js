// 학교 과목조회 표의 각 줄 맨 앞에 담기 별(☆/★)만 붙인다. 네트워크·학교 폼·신청 동작에 손대지 않는다.
// 학교 페이지 배율은 건드리지 않는다(사이드 패널을 열어도 원래 비율, Ctrl+휠 확대는 사용자 몫).
// 별은 수강신청 기간에도 붙인다(신청 기간에도 계획을 많이 세우므로, 별은 이 PC 저장소에만 쓰고 학교 서버에 요청하지 않는다).
// 확장이 업데이트되면 이 탭의 옛 스크립트는 확장과 끊긴다(chrome.runtime.id 없음). 끊긴 쪽은 스스로 멈추고,
// background가 넣어 준 새 스크립트가 옛 별을 지우고 다시 붙인다.
(() => {
  let term = null, dataTerm = null, plan = null, active = false, timer = 0;
  const alive = () => Boolean(chrome.runtime?.id);
  // src/state.js sectionOn과 같은 규칙(content script는 모듈을 못 불러 옮겨 둠): 지금 보는 목록에서 그 분반이 담겨 있으면 켜짐
  const sectionOn = (c, cls, list) => {
    if (!c) return false;
    if (!c.only) return !c.excluded.includes(cls);
    return Boolean((!c.onlyFrom || !list || c.onlyFrom === list) && c.only.includes(cls) && !c.excluded.includes(cls));
  };
  /** 지금 조회한 목록의 학기('2026-2R'). 화면에서 못 읽으면 null */
  const listTerm = () => { const t = `${document.querySelector("#pYear")?.value}-${document.querySelector("#pTerm")?.value}`; return /^\d{4}-[0-9A-Z]{1,3}$/.test(t) ? t : null; };
  document.querySelectorAll(".cp-star").forEach((b) => b.remove());
  document.documentElement.style.zoom = "";   // 예전 버전이 남긴 CSS 배율

  async function load() {
    if (!alive()) return stop();
    const all = await chrome.storage.local.get(["term", "dataTerm"]);
    term = all.term ?? null;
    dataTerm = all.dataTerm ?? null;
    active = Boolean(term);
    plan = term ? (await chrome.storage.local.get(`plan:${term}`))[`plan:${term}`] ?? null : null;
    decorate();
  }

  function decorate() {
    if (!alive()) return stop();
    if (!active) { document.querySelectorAll(".cp-star").forEach((b) => b.remove()); return; }
    for (const grid of document.querySelectorAll(".tabulator")) {
      const mode = grid.querySelector('.tabulator-col[tabulator-field="MODE"]');
      if (mode && mode.style.display !== "none") continue;                  // 신청 버튼이 보이는 표(신청 화면)는 건드리지 않음
      for (const cell of grid.querySelectorAll('.tabulator-row .tabulator-cell[tabulator-field="COUR_CD"]')) {
        const code = cell.textContent.replace(/[☆★]/g, "").trim().match(/^[A-Z0-9]{3,12}/i)?.[0];
        const cls = cell.closest(".tabulator-row").querySelector('.tabulator-cell[tabulator-field="COUR_CLS"]')?.textContent.trim().match(/^[A-Z0-9]{1,4}$/i)?.[0];
        if (!code || !cls) continue;
        // 별은 줄 맨 앞(캠퍼스 칸, '서울'뿐이라 자리가 남음)에 둔다. 학수번호 칸은 좁아서 별을 넣으면 번호가 잘린다
        const home = cell.closest(".tabulator-row").querySelector('.tabulator-cell[tabulator-field="CAMPUS"]');
        const host = home && home.offsetWidth ? home : cell;
        let b = host.querySelector(".cp-star");
        if (!b) {
          b = Object.assign(document.createElement("button"), { type: "button", className: "cp-star" });
          host.prepend(b);
        }
        const on = sectionOn(plan?.courses?.[code], cls, listTerm());
        if (b.dataset.code === code && b.dataset.cls === cls && b.textContent === (on ? "★" : "☆")) continue;   // 바뀐 것만 고친다(관찰자 되먹임 방지)
        b.dataset.code = code;
        b.dataset.cls = cls;
        b.textContent = on ? "★" : "☆";
        b.setAttribute("aria-pressed", on);
        b.setAttribute("aria-label", `${cls}분반 ${on ? "담기 취소" : "시간표 플래너에 담기"}`);
        b.title = `${cls}분반 ${on ? "담기 취소" : "담기"} (시간표 플래너)`;
      }
    }
  }

  // 별마다 붙이지 않고 문서에서 한 번 받는다: 누가 만든 별이든 지금 살아 있는 스크립트가 처리하고, 학수번호 클릭(계획서 열기)으로 번지지 않게 막는다
  async function onClick(e) {
    const b = e.target.closest?.(".cp-star");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!alive()) { stop(); return say("플래너가 업데이트됨 · 이 페이지를 새로고침(F5)하세요"); }
    const { code, cls } = b.dataset, shown = listTerm(), on = sectionOn(plan?.courses?.[code], cls, shown);
    const name = b.closest(".tabulator-row")?.querySelector('[tabulator-field="COUR_NM"] .cell-text')?.textContent.trim() || code;
    const r = await chrome.runtime.sendMessage({ type: "cmd", term, op: "section", args: { code, cls, ...(shown && { from: shown }) } }).catch((err) => ({ error: err.message }));
    // 지금 조회한 목록의 학기가 플래너가 쓰는 과목 목록 학기와 다르면 알려 준다(그 과목은 플래너에서 시간·시험이 안 나옴)
    const other = !on && r?.ok && dataTerm && shown && shown !== dataTerm;
    say(r?.ok ? `${name} ${cls}분반 ${on ? "담기 취소" : "담음"}${other ? ` · 이 목록은 ${shown.replace("-", " ").replace("R", "학기")}, 플래너는 ${dataTerm.replace("-", " ").replace("R", "학기")} 정보를 씀 → 학기를 바꿔 조회하세요` : ""}`
      // 옛 background가 남아 새 요청을 모르면(확장 갱신이 덜 됨): 할 일을 알려 준다
      : r?.error === "허용되지 않은 요청" ? "플래너 갱신이 덜 됨 · 확장 프로그램 화면에서 플래너를 다시 불러온(↻) 뒤 이 페이지를 새로고침(F5)하세요"
      : `저장 실패: ${r?.error ?? ""}`, other || r?.error === "허용되지 않은 요청" ? 6000 : 2500);
  }

  function say(text, ms = 2500) {
    let t = document.querySelector(".cp-toast");
    if (!t) { t = Object.assign(document.createElement("div"), { className: "cp-toast", role: "status" }); document.body.append(t); }
    t.textContent = text;
    t.hidden = false;
    clearTimeout(say.t);
    say.t = setTimeout(() => { t.hidden = true; }, ms);
  }

  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(decorate, 100); });
  function stop() {
    observer.disconnect();
    document.removeEventListener("click", onClick, true);
  }

  chrome.storage.onChanged.addListener((_, area) => area === "local" && load());
  document.addEventListener("click", onClick, true);
  observer.observe(document.body, { childList: true, subtree: true });
  load();
})();
