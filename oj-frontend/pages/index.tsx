import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { Problem } from "@/lib/types";
import clsx from "clsx";

export default function Home() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Problem[]>("/problems")
      .then(res => setProblems(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Problems</h1>

        {loading && <div className="text-gray-500">Loading…</div>}
        {!loading && problems.length === 0 && (
          <div className="rounded-lg border bg-white p-6 text-gray-600">
            No problems yet. Create one via API.
          </div>
        )}

        <ul className="divide-y rounded-lg border bg-white">
          {problems.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div className="min-w-0">
                <Link href={`/problems/${p.id}`} className="truncate font-medium text-gray-900 hover:underline">
                  {p.title}
                </Link>
                <div className="text-xs text-gray-500">slug: {p.slug}</div>
              </div>
              <span
                className={clsx(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                  p.difficulty === "easy" && "bg-green-100 text-green-700",
                  p.difficulty === "medium" && "bg-yellow-100 text-yellow-700",
                  p.difficulty === "hard" && "bg-red-100 text-red-700"
                )}
              >
                {p.difficulty}
              </span>
            </li>
          ))}
        </ul>
      </main>

  );
}
