// 패키지가 이 기기 밖에서도 그대로 도는지: manifest·HTML·import가 가리키는 파일이 전부 zip 안에 있고,
// 동봉한 pdf.js가 잠금 파일 버전과 같은지. 실행: node test/package.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PACK } from "../scripts/pack.mjs";
import { sectionOn } from "../src/state.js";

let bad = 0;
const ok = (cond, name, got) => { bad += !cond; console.log(cond ? "OK  " : "FAIL", name, cond ? "" : JSON.stringify(got)); };
const root = fileURLToPath(new URL("..", import.meta.url));
const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

const entries = [m.background.service_worker, m.side_panel.default_path, ...Object.values(m.icons), ...Object.values(m.action.default_icon),
  ...m.content_scripts.flatMap((c) => [...c.js, ...(c.css ?? [])])];
const seen = new Set(), missing = [], outside = [];
const visit = (abs) => {
  const rel = relative(root, abs).replaceAll("\\", "/");
  if (seen.has(rel)) return;
  seen.add(rel);
  if (!PACK.some((p) => rel === p || rel.startsWith(`${p}/`))) outside.push(rel);
  if (!existsSync(abs)) return missing.push(rel);
  if (!/\.(m?js|html)$/.test(abs) || rel.startsWith("vendor/")) return;
  // 정적 import, 동적 import, new URL(..., import.meta.url), HTML src/href는 파일 기준, getURL은 확장 루트 기준. 개발용 fetch(devdata)는 대상이 아니다.
  const re = /(from\s*|import\(\s*|new URL\(\s*|getURL\(\s*|(?:src|href)=)["']([^"'?#$]+)["'?#]/g;
  for (const [, how, ref] of readFileSync(abs, "utf8").matchAll(re))
    if (!/^[a-z]+:/.test(ref)) visit(how.startsWith("getURL") ? join(root, ref) : resolve(dirname(abs), ref));
};
for (const e of entries) visit(join(root, e));
ok(!missing.length, `참조 파일 ${seen.size}개 모두 있음`, missing);
ok(!outside.length, "참조 파일이 전부 zip 목록 안", outside);

// zip에 드는 스크립트는 전부 문법이 맞아야 한다(화면 코드는 다른 테스트가 불러오지 않으므로 여기서 확인)
const broken = [...seen].filter((f) => /\.m?js$/.test(f) && !f.startsWith("vendor/"))
  .filter((f) => spawnSync(process.execPath, ["--check", join(root, f)]).status !== 0);
ok(!broken.length, "스크립트 문법 확인", broken);

// 과목조회 스크립트는 모듈을 못 불러 별 규칙(sectionOn)을 옮겨 적었다: src/state.js와 같은 답을 내는지
const src = readFileSync(join(root, "ui/content.js"), "utf8").match(/const sectionOn = (\(c, cls, list\) => \{[\s\S]*?\n {2}\});/)?.[1];
const copy = src && new Function(`return ${src}`)();
const C = [undefined, { excluded: [] }, { excluded: ["02"] }, { only: ["01"], excluded: [] }, { only: ["01", "02"], excluded: ["02"] },
  { only: ["01"], onlyFrom: "2026-1R", excluded: [] }, { only: ["01"], onlyFrom: "2027-1R", excluded: [] }];
const diff = copy ? C.flatMap((c) => ["01", "02"].flatMap((cls) => [undefined, "2026-1R", "2027-1R"]
  .filter((t) => copy(c, cls, t) !== sectionOn(c, cls, t)).map((t) => ({ c, cls, t })))) : ["content.js에서 sectionOn을 못 찾음"];
ok(!diff.length, "과목조회 별 규칙 = src/state.js sectionOn", diff);

const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages["node_modules/pdfjs-dist"].version;
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"])
  ok(readFileSync(join(root, "vendor/pdfjs", f), "utf8").includes(`"${lock}"`), `vendor ${f} = pdfjs-dist ${lock}`);
ok(m.minimum_chrome_version && +m.minimum_chrome_version >= 116, "sidePanel.setPanelBehavior는 크롬 116부터", m.minimum_chrome_version);

console.log(`실패 ${bad}`);
process.exit(bad ? 1 : 0);
