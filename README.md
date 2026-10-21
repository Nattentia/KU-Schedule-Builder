# KU-Schedule-Builder

**수강신청에 실패해도 바로 넘어갈 플랜 B, C, D를 미리 만들어 두는 시간표 플래너.**
고려대학교 수강신청 사이트(sugang.korea.ac.kr) 전용 크롬·엣지 확장 프로그램입니다. 비공식이며 학교와 관계없습니다.

> 저는 수강신청에서 매번 최소 플랜 C, 많게는 플랜 E까지 가서야 시간표를 완성했습니다.
> 어느 과목에서 떨어질지 모르니, 떨어질 경우의 수를 하나하나 따져 가며 대체 시간표를 손으로 짰습니다.
> 이 프로그램은 그 작업을 한 번에 끝내려고 만들었습니다.

[English summary below](#english)

---

## 왜 써야 하나

에브리타임 같은 시간표 앱은 **내가 직접 하나씩 끼워 맞춘 시간표 한 장**을 보여줍니다. 수강신청에서 한 과목만 떨어져도, 그 자리를 무엇으로 채울지 그때부터 다시 찾아야 합니다. 신청 시간에는 그럴 여유가 없습니다.

KU-Schedule-Builder는 듣고 싶은 과목을 담기만 하면 **시간이 겹치지 않는 시간표 후보를 전부** 만들어 줍니다.

- **플랜 B·C·D를 미리:** 후보를 `‹ ›`로 넘겨 보며 마음에 드는 것을 ♡로 저장해 두면, 신청 당일 실패해도 다음 시간표가 이미 준비되어 있습니다.
- **떨어진 그 자리에서 바로 대체:** 시간표의 빈 칸을 누르면 그 시간에 다른 과목과 겹치지 않고 들을 수 있는 과목만 나옵니다. 칸을 누르면 같은 과목의 다른 분반·다른 시간으로 바로 바꿉니다.
- **시험까지 함께:** 강의계획서를 읽어 중간·기말 날짜를 달력에 표시하고, 시험이 같은 날 겹치면 알려 줍니다. 확실하지 않은 날짜는 확실하다고 하지 않습니다.
- **수강신청 기간에도 계획:** 신청 기간에도 과목조회의 ☆로 계속 담고 고칠 수 있습니다(학교 서버에 요청하지 않음).

## 기능

| 기능 | 쓰는 법 |
|---|---|
| 과목 담기 | 수강신청 사이트 **과목조회** 표의 ☆ (분반 하나씩) 또는 플래너 검색창의 ☆ (과목째) |
| 우선순위 | 과목마다 1·2·3순위. 1순위가 가장 많이 들어간 후보부터 보여줌 |
| 시간표 후보 생성 | ↻ 한 번. 겹치지 않는 조합을 모두 만들고 학점 한도 안에서 정렬 |
| 플랜 저장 | ♡로 저장, `저장 N`으로 저장한 시간표만 보기 |
| 담기 전 미리보기 | 목록·검색 결과에 마우스를 올리면 그 과목 시간이 반투명으로 겹쳐 보임(겹치면 빨간 테두리) |
| 분반·시간 바꾸기 | 시간표 칸을 누르면 같은 시간 분반이 나뉘어 보이고, 다른 시간은 반투명 칸으로 나타남. 하나 누르면 끝 |
| 빈 시간 과목 찾기 | 시간표 빈 곳을 누르면 그 시간에 겹치지 않고 들을 수 있는 과목만 표시 |
| 시험 달력 | 전체보기에서 월별 달력. 확정 시험일 / 시험 주간 / 퀴즈를 다르게 표시 |
| 수강신청용 복사 | 지금 시간표의 학수번호·분반 목록을 복사 |
| 되돌리기 | 과목 빼기, 모두 비우기, 새 학기로 옮기기 모두 되돌릴 수 있음 |

모든 동작은 클릭 1~2번 안에 끝나도록 만들었습니다.

## 설치 (3분, 한 번만)

1. [Releases](../../releases)에서 최신 `ku-schedule-builder-<버전>.zip`을 받아 압축을 풉니다.
2. 크롬 주소창에 `chrome://extensions` (엣지는 `edge://extensions`) → 오른쪽 위 **개발자 모드** 켜기.
3. **압축해제된 확장 프로그램 로드** → 압축을 푼 폴더 선택.

설치되면 플래너가 한 번 열립니다(학사일정을 받아 둠). 툴바의 퍼즐 아이콘에서 플래너를 고정해 두면 편합니다.

> 크롬 웹스토어에 올리지 않은 확장이라 위처럼 직접 불러와야 하고, 자동 업데이트되지 않습니다. 새 버전은 같은 폴더에 덮어쓴 뒤 확장 화면에서 ↻, 수강신청 탭은 F5.

## 사용 (4단계)

1. 수강신청 사이트 → **과목조회**에서 듣고 싶은 과목의 ☆를 누릅니다.
2. 툴바 아이콘으로 플래너(사이드바)를 열고, 과목마다 순위를 정합니다.
3. **↻**를 눌러 후보를 만들고 `‹ ›`로 넘겨 봅니다. 마음에 드는 것은 ♡.
4. 신청 당일 한 과목이 떨어지면: 그 과목을 빼고 ↻, 또는 빈 칸을 눌러 대체 과목을 찾습니다.

다음 학기 과목 목록이 아직 공개되지 않았으면 작년 같은 학기 목록으로 연습할 수 있고, 새 목록이 나오면 **새 학기로 옮기기** 한 번으로 넘어갑니다.

## 다른 학교에서는?

**고려대학교 수강신청 사이트에서만 동작합니다.** 다른 학교 사이트에서는 별이 붙지 않고 과목 목록도 받아오지 못합니다.
다른 학교에 쓰려면 최소한 아래를 그 학교에 맞게 고쳐야 합니다.

| 고칠 곳 | 내용 |
|---|---|
| `extension/manifest.json` | 대상 사이트 주소(`host_permissions`, `content_scripts.matches`) |
| `extension/src/net.js` | 개설과목·강의계획서·학사일정을 받는 주소와 요청 형식 |
| `extension/src/catalog.js` | 교시 → 시각 표(`PERIODS`), 시간 표기(`월(3)` 형식) 해석 |
| `extension/ui/content.js` | 과목조회 표에 ☆를 붙이는 위치(표 구조) |
| `extension/src/judge.js`, `readers.js` | 강의계획서 형식에 맞춘 시험 날짜 읽기 |

후보 생성, 시간표 화면, 저장 같은 나머지는 학교와 무관하게 그대로 쓸 수 있습니다.

## 안전하게 만든 부분

- **수강신청을 자동으로 하지 않습니다.** 계획만 세웁니다(자동 신청은 매크로로 간주돼 징계 대상이 될 수 있습니다).
- **수강신청·정정 기간에는 학교 서버에 요청하지 않습니다.** 미리 받아 둔 정보로만 보여줍니다.
- **로그인 정보를 받지 않습니다.** 학교 계정 비밀번호를 묻지도 저장하지도 않습니다.
- **모든 데이터는 이 PC 브라우저에만 저장됩니다.** 외부 서버로 보내는 것이 없습니다.
- 학교 사이트는 읽기만 하고, 요청은 하나씩 간격을 두고 캐시를 먼저 씁니다. 강의계획서 원문은 저장소에 넣거나 재배포하지 않습니다.

## 왜 만들었나, 어떻게 동작하나

에브리타임 시간표는 과목을 하나씩 직접 끼워 넣는 방식이라, 조합이 많아지면 경우의 수를 사람이 다 따져야 합니다. 분반을 바꾸거나 빈 시간을 메우는 조작도 여러 단계를 거쳐야 합니다.

그래서 다른 학교·해외 대학의 시간표 도구를 뜯어보고 좋은 점을 가져왔습니다.

- **NUSMods**(싱가포르국립대): 수업 칸을 눌러 그 자리에서 다른 분반으로 바꾸기, 겹치는 칸을 나란히 나눠 그리기
- **SNUTT**(서울대): 빈 시간대로 과목 찾기, 검색 결과와 시간표의 미리보기 연동
- **Coursicle**, 미국 대학들의 Schedule Builder(Stony Brook, UCF 등): 담기 전 반투명 미리보기, 가능한 조합 전체 생성, 우선 과목 고정(여기서는 1순위)

동작 원리:

1. **과목 목록**: 학교 개설과목 조회 결과를 읽어 과목·분반·시간으로 정리합니다. 같은 시간의 분반은 한 칸으로 묶습니다.
2. **후보 생성**: 담은 과목의 시간 묶음 조합 중 겹치지 않는 것을 모두 찾고, 1순위가 가장 많이 들어간 것부터, 학점 한도 안에서 정렬합니다(백그라운드 워커에서 계산).
3. **시험 판정**: 강의계획서(구조화 데이터 + 첨부 PDF·HWP·DOCX)에서 중간·기말 날짜를 읽습니다. 날짜가 확실하면 확정, 주차만 있으면 기간, 근거가 엇갈리면 "확인" 표시와 원문 링크를 붙입니다.
4. **저장**: 담은 과목·순위·저장한 시간표는 브라우저 저장소에만 둡니다.

AI나 외부 서버를 쓰지 않습니다. 같은 입력이면 어느 PC에서나 같은 결과가 나옵니다.

## 개발

Node 20 이상과 git 2.42 이상.

```
cd extension
npm ci
npm test      # 후보·상태·판정·학기 흐름·분반·시간표 배치 테스트 (네트워크 불필요)
npm run pack  # dist/ku-schedule-builder-<버전>.zip
```

코드를 바꾸면 `extension/manifest.json`의 버전을 올리세요. 같은 버전이면 크롬이 예전 background 파일을 계속 쓸 수 있습니다.

## 라이선스

[MIT](LICENSE). 동봉한 pdf.js는 Apache-2.0(`extension/vendor/pdfjs/LICENSE`).

---

<a id="english"></a>
## English

**KU-Schedule-Builder** is an unofficial Chrome/Edge extension for **Korea University's course registration site** (sugang.korea.ac.kr). Add the courses you want, and it generates **every conflict-free timetable**, ranked by your priorities, so you have Plan B, C and D ready before registration opens. If you miss a course on registration day, click the empty slot to see what else fits right there, or click a block to switch to another section or time.

- Works only on Korea University's site. Other schools need changes to the site addresses, period table, page selectors and syllabus parser (see the table above).
- Reads exam dates from syllabi and flags same-day exam clashes.
- Never registers for you, never sends requests to the school during the registration window, never asks for your password. All data stays in your browser.
- Ideas borrowed from NUSMods, SNUTT, Coursicle and US university schedule builders.

Install: download the zip from Releases, unzip, open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, pick the folder.
