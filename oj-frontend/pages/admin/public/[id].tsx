import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { ProblemDetail } from "@/lib/types";

export default function AdminProblemDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const problemId = typeof id === "string" ? Number(id) : NaN;
  const { me, loading } = useMe();

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me?.role === "admin" && Number.isInteger(problemId)) {
      void fetchProblem();
    }
  }, [loading, me, problemId]);

  const fetchProblem = async () => {
    if (!Number.isInteger(problemId)) return;
    try {
      const { data } = await api.get<ProblemDetail>(`/problems/${problemId}`);
      setProblem(data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load problem");
    }
  };

  const uploadCsv = async () => {
    if (!Number.isInteger(problemId)) return;
    if (!csvFile) {
      setError("Select a CSV file to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("replace", replaceExisting ? "true" : "false");
    try {
      await api.post(`/admin/problems/${problemId}/testcases/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStatus("Testcases uploaded.");
      setCsvFile(null);
      setError(null);
      await fetchProblem();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to upload CSV");
    }
  };

  if (loading || !Number.isInteger(problemId)) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!me || me.role !== "admin") {
    return (
      <div className="p-6">
        <button className="text-sm text-indigo-600 underline" onClick={() => router.push("/admin/public")}>
          ← Back
        </button>
        <p className="mt-2 text-sm text-gray-600">Admin access required.</p>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="p-6">
        <button className="text-sm text-indigo-600 underline" onClick={() => router.push("/admin/public")}>
          ← Back
        </button>
        <p className="mt-2 text-sm text-gray-600">{error ?? "Problem not found."}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <button className="text-sm text-indigo-600 underline" onClick={() => router.push("/admin/public")}>
        ← Back to list
      </button>

      <section className="rounded border bg-white p-4 shadow-sm space-y-3">
        <div className="text-2xl font-bold">{problem.title}</div>
        <div className="text-sm text-gray-500">slug: {problem.slug} · {problem.difficulty}</div>
        <div className="prose prose-sm max-w-none rounded border bg-gray-50 p-3">
          <pre className="whitespace-pre-wrap">{problem.statement_md}</pre>
        </div>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Public Samples</h2>
        {problem.public_samples.length === 0 ? (
          <p className="text-sm text-gray-500">No samples yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {problem.public_samples.map((s) => (
              <li key={s.idx} className="rounded border p-3">
                <div className="text-xs font-semibold text-gray-500">Sample #{s.idx}</div>
                <div className="mt-1 grid gap-2 lg:grid-cols-2">
                  <div>
                    <div className="text-xs text-gray-500">Input</div>
                    <pre className="whitespace-pre-wrap rounded bg-gray-50 p-2">{s.input_text}</pre>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Expected</div>
                    <pre className="whitespace-pre-wrap rounded bg-gray-50 p-2">{s.expected_text}</pre>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Upload Testcases (CSV)</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          className="w-full rounded border p-2 text-sm"
          onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
        />
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
          />
          Replace existing testcases
        </label>
        <button
          onClick={uploadCsv}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Upload
        </button>
        <p className="text-xs text-gray-500">
          CSV headers: idx,input_text,expected_text,(optional) timeout_ms,points,is_public.
        </p>
      </section>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
