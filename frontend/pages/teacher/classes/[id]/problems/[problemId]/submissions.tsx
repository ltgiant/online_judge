import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { ClassProblemSubmission } from "@/lib/types";

type ApiResponse = {
  class_id: number;
  problem_id: number;
  problem_title: string | null;
  problem_slug: string | null;
  submissions: ClassProblemSubmission[];
};

export default function ClassProblemSubmissionsPage() {
  const router = useRouter();
  const { id, problemId } = router.query;
  const cid = Number(Array.isArray(id) ? id[0] : id);
  const pid = Number(Array.isArray(problemId) ? problemId[0] : problemId);
  const { me, loading: loadingMe } = useMe();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [onlyAccepted, setOnlyAccepted] = useState(false);

  const submissions = data?.submissions ?? [];
  const studentOptions = Array.from(
    submissions.reduce((acc, s) => {
      if (!acc.has(s.student_id)) {
        acc.set(s.student_id, {
          id: s.student_id,
          name: s.student_username ?? s.student_email,
          email: s.student_email,
        });
      }
      return acc;
    }, new Map<number, { id: number; name: string; email: string }>()),
  ).map(([, value]) => value);
  const filteredSubmissions = submissions.filter((s) => {
    if (selectedStudentId && s.student_id !== selectedStudentId) return false;
    if (onlyAccepted && s.status !== "accepted") return false;
    return true;
  });

  useEffect(() => {
    if (!Number.isInteger(cid) || !Number.isInteger(pid)) return;
    if (loadingMe) return;
    if (!me || (me.role !== "teacher" && me.role !== "admin")) {
      setError("Teacher/Admin access required");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get<ApiResponse>(`/teacher/classes/${cid}/problems/${pid}/submissions`)
      .then((res) => setData(res.data))
      .catch((e: any) => setError(e?.response?.data?.detail ?? "Failed to load submissions"))
      .finally(() => setLoading(false));
  }, [cid, pid, me, loadingMe]);

  if (loading || loadingMe) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!me || (me.role !== "teacher" && me.role !== "admin")) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Submissions</h1>
        <p className="mt-2 text-sm text-gray-600">Sign in as a teacher/admin to view.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Submissions</h1>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <button className="mt-3 rounded border px-3 py-1 text-sm" onClick={() => router.back()}>
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <button className="text-sm text-indigo-600 underline" onClick={() => router.back()}>
        ← 돌아가기
      </button>
      <div>
        <h1 className="text-2xl font-bold">Submissions</h1>
        {data && (
          <p className="text-sm text-gray-600">
            {data.problem_title ?? "Problem"} {data.problem_slug ? `(${data.problem_slug})` : ""}
          </p>
        )}
      </div>
      {data && data.submissions.length === 0 && (
        <div className="rounded border bg-white p-4 text-sm text-gray-600">No submissions yet.</div>
      )}
      {data && data.submissions.length > 0 && (
        <div className="rounded border bg-white p-4">
          {filteredSubmissions.length === 0 && (
            <div className="mb-3 rounded border bg-gray-50 p-2 text-xs text-gray-600">
              선택한 조건에 해당하는 제출 기록이 없습니다.
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="px-2 py-1">
                  <div className="flex flex-col gap-1">
                    <span>Student</span>
                    <div>
                      <select
                        className="rounded border px-2 py-0.5 text-[10px] font-normal"
                        value={selectedStudentId ?? ""}
                        onChange={(e) => {
                          const next = e.target.value ? Number(e.target.value) : null;
                          setSelectedStudentId(Number.isNaN(next as number) ? null : next);
                        }}
                      >
                        <option value="">전체</option>
                        {studentOptions.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </th>
                <th className="px-2 py-1">
                  <div className="flex flex-col gap-1">
                    <span>Status</span>
                    <div>
                      <button
                        className={`rounded border px-2 py-0.5 text-[10px] font-normal ${
                          onlyAccepted ? "bg-gray-100 text-gray-700" : "hover:bg-white"
                        }`}
                        onClick={() => setOnlyAccepted((prev) => !prev)}
                      >
                        Accepted만
                      </button>
                    </div>
                  </div>
                </th>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Submitted at</th>
                <th className="px-2 py-1">Code</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="px-2 py-1">
                    <div className="font-semibold">{s.student_username ?? s.student_email}</div>
                    <div className="text-xs text-gray-500">{s.student_email}</div>
                  </td>
                  <td className="px-2 py-1">{s.status}</td>
                  <td className="px-2 py-1">{s.score}</td>
                  <td className="px-2 py-1">{s.time_ms ?? 0} ms</td>
                  <td className="px-2 py-1 text-xs text-gray-600">{s.created_at ?? "-"}</td>
                  <td className="px-2 py-1">
                    <details className="border rounded p-2 bg-gray-50 text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                      <summary className="cursor-pointer text-gray-700">View code</summary>
                      {s.source_code}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
