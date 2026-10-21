// 배포 zip: 커밋된 파일만(git archive) 넣어서 어느 기기에서 만들어도 같은 내용이 나온다. 실행: npm run pack
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PACK = ["manifest.json", "background.js", "src", "ui", "vendor", "icons"];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { version } = JSON.parse(readFileSync(`${root}manifest.json`, "utf8"));
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...PACK], { cwd: root, encoding: "utf8" });
  if (dirty) console.warn(`커밋 안 된 변경은 zip에 안 들어간다:\n${dirty}`);
  const out = `dist/ku-schedule-builder-${version}.zip`;
  mkdirSync(`${root}../dist`, { recursive: true });
  // 경로 인자는 현재 폴더 기준이라 저장소 루트에서 묶는다. 트리를 묶으면 파일 시각이 '지금'이 되므로 커밋 시각으로 고정한다(git 2.42+).
  const git = (...a) => execFileSync("git", a, { cwd: `${root}..`, encoding: "utf8" });
  git("archive", "--format=zip", `--mtime=${git("log", "-1", "--format=%cI").trim()}`, "-o", out, "HEAD:extension", ...PACK);
  console.log(out);
}
