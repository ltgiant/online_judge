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
  const [robotSlug, setRobotSlug] = useState("");
  const [robotTitle, setRobotTitle] = useState("");
  const [robotDifficulty, setRobotDifficulty] = useState<Problem["difficulty"]>("easy");
  const [robotStatement, setRobotStatement] = useState("");
  const [robotStarter, setRobotStarter] = useState<string>(
`# hubo API: move, turn_left, turn_right, is_wall, is_coin, pick_coin, position, direction

# TODO: implement robot logic
`
  );
  const [robotConfig, setRobotConfig] = useState<string>(
`{
  "grid": { "width": 10, "height": 10 },
  "start": { "x": 1, "y": 1, "dir": "top" },
  "walls": [],
  "coins": [],
  "goal": { "final": { "x": 1, "y": 1, "dir": "top" } }
}`
  );

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

  const createRobotProblem = async () => {
    if (!robotSlug.trim() || !robotTitle.trim() || !robotStatement.trim()) {
      setError("Robot slug, title, and statement are required");
      return;
    }
    let config: any = null;
    try {
      config = JSON.parse(robotConfig);
    } catch {
      setError("Robot config must be valid JSON");
      return;
    }
    const payload = {
      slug: robotSlug.trim(),
      title: robotTitle.trim(),
      difficulty: robotDifficulty,
      statement_md: robotStatement,
      starter_code: robotStarter.trim() || undefined,
      config,
    };
    try {
      await api.post("/admin/robot-problems", payload);
      setStatus("Robot problem created");
      setRobotSlug("");
      setRobotTitle("");
      setRobotStatement("");
      setRobotStarter(`# hubo API: move, turn_left, turn_right, is_wall, is_coin, pick_coin, position, direction\n\n# TODO: implement robot logic\n`);
      setRobotConfig(`{\n  \"grid\": { \"width\": 10, \"height\": 10 },\n  \"start\": { \"x\": 1, \"y\": 1, \"dir\": \"top\" },\n  \"walls\": [],\n  \"coins\": [],\n  \"goal\": { \"final\": { \"x\": 1, \"y\": 1, \"dir\": \"top\" } }\n}`);
      setError(null);
      await fetchProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create robot problem");
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
          생성
        </button>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Create Robot Problem</h2>
        <input
          className="w-full rounded border p-2 text-sm"
          placeholder="Slug"
          value={robotSlug}
          onChange={(e) => setRobotSlug(e.target.value)}
        />
        <input
          className="w-full rounded border p-2 text-sm"
          placeholder="Title"
          value={robotTitle}
          onChange={(e) => setRobotTitle(e.target.value)}
        />
        <select
          className="w-full rounded border p-2 text-sm"
          value={robotDifficulty}
          onChange={(e) => setRobotDifficulty(e.target.value as Problem["difficulty"])}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <textarea
          className="w-full rounded border p-2 text-sm"
          rows={6}
          placeholder="Statement (Markdown)"
          value={robotStatement}
          onChange={(e) => setRobotStatement(e.target.value)}
        />
        <label className="text-sm font-medium text-gray-700">Starter Code (optional)</label>
        <textarea
          className="w-full rounded border p-2 text-sm font-mono"
          rows={6}
          value={robotStarter}
          onChange={(e) => setRobotStarter(e.target.value)}
        />
        <label className="text-sm font-medium text-gray-700">Robot Config (JSON)</label>
        <textarea
          className="w-full rounded border p-2 text-sm font-mono"
          rows={10}
          value={robotConfig}
          onChange={(e) => setRobotConfig(e.target.value)}
        />
        <button
          onClick={createRobotProblem}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        >
          로봇 문제 생성
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
                    관리
                  </button>
                  <button
                    className="rounded border border-red-500 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => deleteProblem(prob.id, prob.title)}
                  >
                    삭제
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
