// oj-frontend/pages/problems/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { ProblemDetail, SubmissionSummary, SubmissionResult } from "@/lib/types";

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

export default function ProblemPage() {
  const router = useRouter();
  const { id } = router.query;
  const pid = Number(Array.isArray(id) ? id[0] : id);

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState<string>("print(sum(map(int, input().split())))\n");
  const [subId, setSubId] = useState<number | null>(null);
  const [status, setStatus] = useState<SubmissionSummary["status"] | null>(null);
  const [results, setResults] = useState<SubmissionResult[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
          const r = await api.get<SubmissionResult[]>(`/submissions/${subId}/results`);
          if (!active) return;
          setResults(r.data);
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
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 문제 본문 */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">{problem.title}</h1>
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

            {/* 에디터/제출/결과 */}
            <section className="space-y-4">
              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold">Editor (Python)</div>
                <div className="p-3">
                  <div className="overflow-hidden rounded-md border">
                    <MonacoEditor
                      height="280px"
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
                <div className="border-b px-4 py-2.5 text-sm font-semibold">Results</div>
                {!results && (
                  <div className="px-4 py-3 text-sm text-gray-500">Submit to see results. (Auto-refreshing…)</div>
                )}
                {results && (
                  <div className="overflow-x-auto p-3">
                    <table className="min-w-full border text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border px-2 py-1 text-left">#</th>
                          <th className="border px-2 py-1 text-left">Verdict</th>
                          <th className="border px-2 py-1 text-right">Time (ms)</th>
                          <th className="border px-2 py-1 text-left">Stdout</th>
                          <th className="border px-2 py-1 text-left">Stderr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr key={i} className="odd:bg-white even:bg-gray-50">
                            <td className="border px-2 py-1">{r.idx}</td>
                            <td className="border px-2 py-1">
                              <span className={verdictClass(r.verdict)}>{r.verdict}</span>
                            </td>
                            <td className="border px-2 py-1 text-right">{r.time_ms}</td>
                            <td className="border px-2 py-1">
                              <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">{r.stdout}</pre>
                            </td>
                            <td className="border px-2 py-1">
                              <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px] text-red-700">
                                {r.stderr}
                              </pre>
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