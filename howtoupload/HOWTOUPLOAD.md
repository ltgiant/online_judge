# HOW TO UPLOAD (Frontend Only)

교사용 UI에서만 문제를 등록하고 테스트케이스를 올리는 순서를 예시와 함께 정리했습니다. 권한(teacher/admin)과 토큰 준비는 완료되어 있다고 가정합니다.

## 준비 파일
- `howtoupload/example_problem.md`: 예시 문제 설명(마크다운)
- `howtoupload/example_testcases.csv`: 예시 테스트케이스(CSV, 함수 반환 비교 방식)

## 업로드 경로
- 클래스 관리/업로드: `http://localhost:3000/teacher/classes`
- 클래스 상세: `http://localhost:3000/teacher/classes/[id]`
  - **Problems** 섹션에서 문제 생성 및 테스트케이스 업로드

## 문제 생성 절차
1) 클래스 선택: `Classes` 목록에서 새 클래스 생성 또는 기존 클래스 클릭.
2) 문제 추가 버튼: **Problems** 섹션에서 `Create problem` 클릭.
3) 입력 필드 작성(예시 포함):
   - `slug`: URL용 고유 식별자. 소문자/숫자/하이픈 권장. 예: `two-sum`.
   - `title`: 문제 제목. 예: `두 수의 합`.
   - `difficulty`: `easy` / `medium` / `hard` 중 선택. 예: `easy`.
   - `statement_md`: 문제 본문(마크다운). 예시로 `howtoupload/example_problem.md` 내용을 그대로 붙여 넣으세요.
4) 저장하면 문제가 클래스에 추가됩니다(아직 테스트케이스 없음).

## 테스트케이스 업로드 절차 (CSV)
1) 같은 **Problems** 섹션에서 `Upload testcases (CSV)` 클릭.
2) `replace` 옵션:
   - 켜면 기존 테스트케이스를 모두 교체.
   - 끄면 기존에 추가로 붙음(권장: 켜기).
3) 파일 선택: `howtoupload/example_testcases.csv` 선택 후 업로드.
4) 완료 후 문제 상세에서 공개 샘플(`is_public=true`)이 예제로 노출됩니다.

## 작성 팁
- 함수 반환 비교(권장): 학생은 `answer(...)` 함수를 구현하고, CSV의 `input_text`/`expected_text`를 JSON으로 작성합니다.
  - 포지셔널 인자만: `[4, [2,7,11,15], 9]` → `answer(4, [2,7,11,15], 9)`
  - 키워드 포함: `{"args":[10], "kwargs":{"k":2}}` → `answer(10, k=2)`
- `is_public=true`인 행만 예제로 노출됩니다. 나머지는 비공개 테스트.
- CSV 헤더는 `idx,input_text,expected_text,timeout_ms,points,is_public` 형식을 따릅니다(예시 파일 참고).

## 바로 쓸 수 있는 예시
- 문제 본문: `howtoupload/example_problem.md`
- 테스트케이스: `howtoupload/example_testcases.csv`
이 두 파일을 UI에 그대로 붙여/업로드하면 예시 문제가 생성됩니다.
