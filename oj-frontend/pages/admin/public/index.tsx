import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { Problem, ProblemCreatePayload } from "@/lib/types";

export default function AdminPublicProblemsPage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Problem["difficulty"]>("easy");
  const [statement, setStatement] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starterCode, setStarterCode] = useState<string>(
`def answer(...):
    # TODO: implement
    return None
`);

  useEffect(() => {
    if (!loading && me?.role === "admin") {
      void fetchProblems();
    }
  }, [loading, me]);

  const fetchProblems = async () => {
    try {
      const { data } = await api.get<Problem[]>("/admin/problems");
      setProblems(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load problems");
    }
  };

  const createProblem = async () => {
    if (!slug.trim() || !title.trim() || !statement.trim()) {
      setError("Slug, title, and statement are required");
      return;
    }
    const payload: ProblemCreatePayload = {
      slug: slug.trim(),
      title: title.trim(),
      difficulty,
      statement_md: statement,
      starter_code: starterCode.trim() || undefined,
    };
    try {
      await api.post("/admin/problems", payload);
      setStatus("Problem created");
      setSlug("");
      setTitle("");
      setStatement("");
      setStarterCode(`def answer(...):\n    # TODO: implement\n    return None\n`);
      setError(null);
      await fetchProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create problem");
    }
  };

  const deleteProblem = async (pid: number, problemTitle: string) => {
    if (!confirm(`Delete problem "${problemTitle}"? This removes all testcases/submissions.`)) return;
    try {
      await api.delete(`/admin/problems/${pid}`);
      setStatus(`Deleted problem ${problemTitle}`);
      await fetchProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to delete problem");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!me || me.role !== "admin") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Public Problems</h1>
        <p className="mt-2 text-sm text-gray-600">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Public Problems</h1>
        <p className="text-sm text-gray-600">Create or manage problems available to everyone.</p>
      </div>

      <section className="rounded border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Create Problem</h2>
        <input
          className="w-full rounded border p-2 text-sm"
          placeholder="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <input
          className="w-full rounded border p-2 text-sm"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="w-full rounded border p-2 text-sm"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Problem["difficulty"])}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <textarea
          className="w-full rounded border p-2 text-sm"
          rows={6}
          placeholder="Statement (Markdown)"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
        <label className="text-sm font-medium text-gray-700">Starter Code (optional)</label>
        <textarea
          className="w-full rounded border p-2 text-sm font-mono"
          rows={6}
          placeholder={`def answer(...):\n    # TODO: implement\n    return None`}
          value={starterCode}
          onChange={(e) => setStarterCode(e.target.value)}
        />
        <button
          onClick={createProblem}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Create
        </button>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Existing Problems</h2>
        {problems.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No public problems.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {problems.map((prob) => (
              <li key={prob.id} className="flex items-center justify-between rounded border p-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {prob.title} <span className="text-xs text-gray-500">#{prob.id}</span>
                  </div>
                  <div className="text-xs text-gray-500">slug: {prob.slug} · {prob.difficulty}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded border px-3 py-1 text-xs hover:bg-gray-50"
                    onClick={() => router.push(`/admin/public/${prob.id}`)}
                  >
                    Manage
                  </button>
                  <button
                    className="rounded border border-red-500 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => deleteProblem(prob.id, prob.title)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
