// oj-frontend/pages/problems/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { ProblemDetail, SubmissionSummary, SubmissionResult, SubmissionResultsResponse } from "@/lib/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const verdictClass = (v: SubmissionResult["verdict"]) =>
  clsx(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
    v === "ok" && "bg-green-100 text-green-700",
    v === "wa" && "bg-amber-100 text-amber-700",
    v === "re" && "bg-red-100 text-red-700",
    v === "tle" && "bg-blue-100 text-blue-700",
    v === "skipped" && "bg-gray-100 text-gray-600"
  );

const statusClass = (s: SubmissionSummary["status"]) =>
  clsx(
    "rounded-md px-2 py-0.5 text-xs font-semibold",
    s === "accepted" && "bg-green-100 text-green-700",
    s === "wrong_answer" && "bg-amber-100 text-amber-700",
    s === "runtime_error" && "bg-red-100 text-red-700",
    s === "tle" && "bg-blue-100 text-blue-700",
    s === "queued" && "bg-gray-100 text-gray-600",
    s === "running" && "bg-purple-100 text-purple-700",
    s === "compile_error" && "bg-red-100 text-red-700",
    s === "system_error" && "bg-slate-100 text-slate-700"
  );

const DEFAULT_CODE = `def answer(n: int, nums: list[int], target: int) -> tuple[int, int]:
    # TODO: implement
    return (0, 0)
`;

export default function ProblemPage() {
  const router = useRouter();
  const { id } = router.query;
  const pid = Number(Array.isArray(id) ? id[0] : id);

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [codeInitialized, setCodeInitialized] = useState(false);
  const [subId, setSubId] = useState<number | null>(null);
  const [status, setStatus] = useState<SubmissionSummary["status"] | null>(null);
  const [results, setResults] = useState<SubmissionResult[] | null>(null);
  const [totalTestcases, setTotalTestcases] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mySubs, setMySubs] = useState<SubmissionSummary[]>([]);
  const [solved, setSolved] = useState(false);
  const [loadingMySubs, setLoadingMySubs] = useState(false);
  const [runInput, setRunInput] = useState<string>("");
  const [runOutput, setRunOutput] = useState<{
    mode: "payload" | "stdin";
    result: any;
    stdout: string;
    stderr: string;
    time_ms: number;
    return_code: number;
  } | null>(null);
  const [runningCode, setRunningCode] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const codeStorageKey = Number.isFinite(pid) ? `oj_code_${pid}` : null;
  const runInputStorageKey = Number.isFinite(pid) ? `oj_run_input_${pid}` : null;

  const tryConvertSimpleInput = useCallback((text: string) => {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    // 형태: 첫 줄 n, 둘째 줄 배열, 셋째 줄 target
    if (lines.length === 3) {
      const n = Number(lines[0]);
      const arr = lines[1]
        .split(/\s+/)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
      const target = Number(lines[2]);
      if (Number.isFinite(n) && Number.isFinite(target) && arr.length > 0) {
        return { args: [n, arr, target], kwargs: {} };
      }
    }
    return null;
  }, []);

  const formatResult = (val: any) => {
    if (val === null || val === undefined) return "null";
    if (Array.isArray(val)) {
      // 평범한 원소라면 공백 구분으로 보여주기
      const flat = val.every((v) => ["string", "number", "boolean"].includes(typeof v));
      return flat ? val.join(" ") : JSON.stringify(val);
    }
    if (typeof val === "object") return JSON.stringify(val);
    if (typeof val === "string") {
      const t = val.trim();
      // 튜플 표기 "(0, 1)" 같은 경우 공백 구분으로 변환
      if (t.startsWith("(") && t.endsWith(")")) {
        return t.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).join(" ");
      }
      return t;
    }
    return String(val);
  };

  const formatExpected = (text?: string) => {
    if (!text) return "";
    try {
      return formatResult(JSON.parse(text));
    } catch {
      return text.trim();
    }
  };

  const formatInput = (text?: string) => {
    if (!text) return "";
    try {
      const data = JSON.parse(text);
      if (data && typeof data === "object" && ("args" in data || "kwargs" in data)) {
        const lines: string[] = [];
        const args: any[] = Array.isArray((data as any).args) ? (data as any).args : [];
        const kwargs = (data as any).kwargs && typeof (data as any).kwargs === "object" ? (data as any).kwargs : {};
        args.forEach((v) => lines.push(formatResult(v)));
        Object.entries(kwargs).forEach(([k, v]) => lines.push(`${k}=${formatResult(v)}`));
        return lines.join("\n");
      }
    } catch {
      // fallback to raw text
    }
    return text.trim();
  };

  const displayedResults = results ? results.filter((r) => r.verdict !== "ok") : null;
  const passedCount = results ? results.filter((r) => r.verdict === "ok").length : 0;
  const totalCount = totalTestcases ?? (results ? results.length : 0);

  // 로그인/검증 상태
  const { me, loading: loadingMe } = useMe();
  const canSubmit = !!me && me.is_verified;

  // 문제 상세 로드
  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    setLoading(true);
    setError(null);
    api
      .get<ProblemDetail>(`/problems/${pid}`)
      .then((res) => setProblem(res.data))
      .catch(() => setError("Failed to load problem"))
      .finally(() => setLoading(false));
  }, [pid]);

  useEffect(() => {
    if (!me || !Number.isFinite(pid)) {
      setMySubs([]);
      setSolved(false);
      return;
    }
    setLoadingMySubs(true);
    api
      .get<{ solved: boolean; submissions: SubmissionSummary[] }>(`/problems/${pid}/my-submissions`)
      .then((res) => {
        setSolved(res.data.solved);
        setMySubs(res.data.submissions);
      })
      .catch(() => setMySubs([]))
      .finally(() => setLoadingMySubs(false));
    }, [me, pid]);

  // 문제 starter_code 로드 후 에디터 초기화 (사용자가 수정했다면 덮어쓰지 않도록 1회만)
  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    setCode(DEFAULT_CODE);
    setCodeInitialized(false);
  }, [pid]);

  // 로컬 저장 코드 불러오기
  useEffect(() => {
    if (!Number.isFinite(pid) || codeInitialized) return;
    if (!codeStorageKey) return;
    try {
      const saved = window.localStorage.getItem(codeStorageKey);
      if (saved !== null) {
        setCode(saved);
        setCodeInitialized(true);
      }
    } catch {
      // ignore localStorage errors (e.g., private mode)
    }
  }, [pid, codeInitialized, codeStorageKey]);

  useEffect(() => {
    if (!problem || codeInitialized) return;
    setCode(problem.starter_code || DEFAULT_CODE);
    setCodeInitialized(true);
  }, [problem, codeInitialized]);

  // 코드 자동 저장
  useEffect(() => {
    if (!Number.isFinite(pid) || !codeInitialized || !codeStorageKey) return;
    try {
      window.localStorage.setItem(codeStorageKey, code);
    } catch {
      // ignore write failures
    }
  }, [pid, code, codeInitialized, codeStorageKey]);

  // 실행 입력 초기값/저장값: 문제별로 로컬에 보관
  useEffect(() => {
    if (!Number.isFinite(pid)) {
      setRunInput("");
      setRunOutput(null);
      return;
    }
    let restored = false;
    if (runInputStorageKey) {
      try {
        const saved = window.localStorage.getItem(runInputStorageKey);
        if (saved !== null) {
          setRunInput(saved);
          restored = true;
        }
      } catch {
        /* ignore */
      }
    }
    if (!restored) {
      const sampleInput = problem?.public_samples?.[0]?.input_text ?? "";
      setRunInput(sampleInput);
    }
    setRunOutput(null);
    setRunError(null);
  }, [pid, problem?.id, problem?.public_samples, runInputStorageKey]);

  // 실행 입력 자동 저장
  useEffect(() => {
    if (!Number.isFinite(pid) || !runInputStorageKey) return;
    try {
      window.localStorage.setItem(runInputStorageKey, runInput);
    } catch {
      // ignore write failures
    }
  }, [pid, runInput, runInputStorageKey]);

  // 실행 (채점 없이 즉시 결과 확인)
  const runCode = useCallback(async () => {
    if (!Number.isFinite(pid)) return;
    if (!me) {
      setRunError("Login required. Please sign in first.");
      return;
    }
    if (!me.is_verified) {
      setRunError("Email not verified. Please verify your email.");
      return;
    }
    setRunningCode(true);
    setRunError(null);
    setRunOutput(null);

    let mode: "payload" | "stdin" = "stdin";
    let payload: any = null;
    let stdinText = runInput;
    if (runInput.trim() !== "") {
      try {
        payload = JSON.parse(runInput);
        mode = "payload";
        stdinText = "";
      } catch {
        // JSON 파싱 실패 시, 간단한 3줄 포맷(한 줄 n, 한 줄 배열, 한 줄 target) 변환 시도
        const converted = tryConvertSimpleInput(runInput);
        if (converted) {
          payload = converted;
          mode = "payload";
          stdinText = "";
        } else {
          payload = null;
          mode = "stdin";
        }
      }
    }

    try {
      const res = await api.post("/sandbox/run", {
        source_code: code,
        payload: mode === "payload" ? payload : null,
        stdin_text: mode === "stdin" ? stdinText : "",
      });
      setRunOutput(res.data);
    } catch (e: any) {
      const msg =
        e?.response?.status === 401
          ? "Not authenticated. Please log in and try again."
          : e?.response?.data?.detail || "Run failed";
      setRunError(msg);
    } finally {
      setRunningCode(false);
    }
  }, [pid, me, runInput, code]);

  // 제출
  const submit = useCallback(async () => {
    if (!Number.isFinite(pid)) return;

    if (!me) {
      setError("Login required. Please sign in first.");
      return;
    }
    if (!me.is_verified) {
      setError("Email not verified. Please verify your email.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResults(null);
    setSubId(null);
    setStatus(null);
    try {
      const res = await api.post<{ submission_id: number; status: string }>(`/submissions`, {
        problem_id: pid,
        source_code: code,
      });
      setSubId(res.data.submission_id);
      setStatus(res.data.status as SubmissionSummary["status"]);
    } catch (e: any) {
      const msg =
        e?.response?.status === 401
          ? "Not authenticated. Please log in and try again."
          : e?.response?.data?.detail || "Submit failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [pid, code, me]);

  // 상태 폴링
  useEffect(() => {
    if (!subId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const s = await api.get<SubmissionSummary>(`/submissions/${subId}`);
        if (!active) return;
        setStatus(s.data.status);
        if (
          ["accepted", "wrong_answer", "tle", "runtime_error", "compile_error", "system_error"].includes(
            s.data.status
          )
        ) {
          const r = await api.get<SubmissionResultsResponse>(`/submissions/${subId}/results`);
          if (!active) return;
          setResults(r.data.results);
          setTotalTestcases(r.data.total_testcases);
          clearInterval(interval);
        }
      } catch {
        // 폴링 중 에러는 무시
      }
    }, 600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [subId]);

  return (
    <div className="min-h-screen bg-gray-50 lg:h-full lg:overflow-hidden">
      <main className="w-full px-2 sm:px-3 lg:px-4 py-3 lg:py-0 lg:h-full lg:overflow-hidden lg:box-border">
        {loading && <div className="text-gray-500">Loading…</div>}

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error} {!me && <a className="ml-2 underline" href="/login">Go to Login</a>}
          </div>
        )}

        {!loadingMe && me && !me.is_verified && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your email is not verified. Please check your inbox (or use the verify link shown after sign-up in dev mode).
          </div>
        )}

        {!loading && problem && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 lg:items-start lg:h-full lg:overflow-hidden">
            {/* 문제 본문 */}
            <section className="space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{problem.title}</h1>
                  {me && (
                    <div className="mt-1 text-xs text-gray-600">
                      Status:{" "}
                      {solved ? (
                        <span className="font-semibold text-green-600">Solved</span>
                      ) : (
                        <span className="font-semibold text-gray-500">Not solved</span>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    problem.difficulty === "easy" && "bg-green-100 text-green-700",
                    problem.difficulty === "medium" && "bg-yellow-100 text-yellow-700",
                    problem.difficulty === "hard" && "bg-red-100 text-red-700"
                  )}
                >
                  {problem.difficulty}
                </span>
              </div>

              <div className="prose prose-sm max-w-none rounded-lg border bg-white px-5 py-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {(problem.statement_md ?? "").replace(/\\n/g, "\n")}
                </ReactMarkdown>
              </div>

              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold">Public Samples</div>
                <ul className="divide-y">
                  {problem.public_samples.length === 0 && (
                    <li className="px-4 py-3 text-sm text-gray-500">None</li>
                  )}
                  {problem.public_samples.map((s) => (
                    <li key={s.idx} className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
                      <div>
                        <div className="text-gray-500">Input</div>
                        <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-2">{s.input_text}</pre>
                      </div>
                      <div>
                        <div className="text-gray-500">Expected</div>
                        <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-2">{s.expected_text}</pre>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            {/* 에디터/제출/결과 (오른쪽) */}
            <section className="flex flex-col gap-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold">Editor (Python)</div>
                <div className="p-3">
                  <div className="overflow-hidden rounded-md border">
                    <MonacoEditor
                      height="420px"
                      defaultLanguage="python"
                      value={code}
                      onChange={(v) => setCode(v ?? "")}
                      options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2 }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={submit}
                      disabled={submitting || !canSubmit}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {!me ? "Login to Submit" : !me.is_verified ? "Verify email to submit" : submitting ? "Submitting…" : "Submit"}
                    </button>

                    {subId && (
                      <div className="text-sm text-gray-700">
                        <span className="text-gray-500">Submission:</span>{" "}
                        <span className="font-mono">{subId}</span>{" "}
                        <span className="ml-2 text-gray-500">Status:</span>{" "}
                        <span className={status ? statusClass(status) : "px-2 py-0.5 text-xs text-gray-500"}>
                          {status ?? "-"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold flex items-center justify-between gap-3">
                  <span>Run</span>
                  <div className="flex items-center gap-2 justify-end">
                    {[0, 1, 2].map((i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const sample = problem?.public_samples?.[i];
                          if (sample) setRunInput(sample.input_text || "");
                        }}
                        disabled={!problem?.public_samples?.[i]}
                        className="inline-flex items-center rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {problem?.public_samples?.[i] ? `Sample ${i + 1}` : `Sample ${i + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                    rows={4}
                    value={runInput}
                    onChange={(e) => setRunInput(e.target.value)}
                    placeholder='예) {"args": [1, [2,3]], "kwargs": {}} 또는 "raw stdin"'
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={runCode}
                      disabled={runningCode || !canSubmit}
                      className="inline-flex items-center rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {!me ? "Login to Run" : !me.is_verified ? "Verify email to run" : runningCode ? "Running…" : "Run"}
                    </button>
                    {runningCode && <span className="text-xs text-gray-600">Executing…</span>}
                  </div>
                  {runError && (
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{runError}</div>
                  )}
                  {runOutput && (
                    <div className="space-y-2 rounded-md border bg-gray-50 p-3 text-xs">
                      <div className="flex flex-wrap gap-3 text-gray-700">
                        <span className="font-semibold">Mode:</span> <span className="font-mono">{runOutput.mode}</span>
                        <span className="font-semibold">Time:</span> <span className="font-mono">{runOutput.time_ms} ms</span>
                        <span className="font-semibold">Exit:</span> <span className="font-mono">{runOutput.return_code}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">Return value</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] font-mono">
                          {formatResult(runOutput.result)}
                        </pre>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">Stdout</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] font-mono">
                          {runOutput.stdout || ""}
                        </pre>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">Stderr</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] font-mono text-red-700">
                          {runOutput.stderr || ""}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold">Results</div>
                {!results && (
                  <div className="px-4 py-3 text-sm text-gray-500">Submit to see results. (Auto-refreshing…)</div>
                )}
                {results && (
                  <div className="px-4 py-2 text-sm text-gray-700">
                    Passed: <span className="font-semibold">{passedCount}</span>
                    {"/"}
                    <span className="font-semibold">{totalCount}</span>
                  </div>
                )}
                {results && displayedResults && displayedResults.length === 0 && (
                  <div className="px-4 py-3 text-sm text-green-700">All testcases passed.</div>
                )}
                {displayedResults && displayedResults.length > 0 && (
                  <div className="overflow-x-auto p-3">
                    <table className="min-w-full border text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border px-2 py-1 text-left">Verdict</th>
                          <th className="border px-2 py-1 text-right">Time (ms)</th>
                          <th className="border px-2 py-1 text-left">Input</th>
                          <th className="border px-2 py-1 text-left">Expected</th>
                          <th className="border px-2 py-1 text-left">Return value</th>
                          <th className="border px-2 py-1 text-left">Stdout</th>
                          <th className="border px-2 py-1 text-left">Stderr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedResults.map((r, i) => (
                          <tr key={r.result_id ?? i} className="odd:bg-white even:bg-gray-50">
                            <td className="border px-2 py-1">
                              <span className={verdictClass(r.verdict)}>{r.verdict}</span>
                            </td>
                            <td className="border px-2 py-1 text-right">{r.time_ms}</td>
                            <td className="border px-2 py-1">
                              {r.verdict === "ok" ? (
                                ""
                              ) : (
                                <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">
                                  {formatInput(r.input_text)}
                                </pre>
                              )}
                            </td>
                            <td className="border px-2 py-1">
                              {r.verdict === "ok" ? (
                                ""
                              ) : (
                                <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">
                                  {formatExpected(r.expected_text)}
                                </pre>
                              )}
                            </td>
                            <td className="border px-2 py-1">
                              {r.verdict === "ok" ? (
                                ""
                              ) : (
                                <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">
                                  {r.return_value === null || r.return_value === undefined ? "" : formatResult(r.return_value)}
                                </pre>
                              )}
                            </td>
                            <td className="border px-2 py-1">
                              {r.verdict === "ok" ? (
                                ""
                              ) : (
                                <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">{r.stdout}</pre>
                              )}
                            </td>
                            <td className="border px-2 py-1">
                              {r.verdict === "ok" ? (
                                ""
                              ) : (
                                <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px] text-red-700">
                                  {r.stderr}
                                </pre>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
