import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { ClassStudentSubmission } from "@/lib/types";

type ApiResponse = {
  student_id: number;
  student_email: string;
  student_username: string;
  class_id: number;
  submissions: ClassStudentSubmission[];
};

export default function ClassStudentSubmissionsPage() {
  const router = useRouter();
  const { id, studentId } = router.query;
  const cid = Number(Array.isArray(id) ? id[0] : id);
  const sid = Number(Array.isArray(studentId) ? studentId[0] : studentId);
  const { me, loading: loadingMe } = useMe();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(cid) || !Number.isInteger(sid)) return;
    if (loadingMe) return;
    if (!me || (me.role !== "teacher" && me.role !== "admin")) {
      setError("Teacher/Admin access required");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get<ApiResponse>(`/teacher/classes/${cid}/students/${sid}/submissions`)
      .then((res) => setData(res.data))
      .catch((e: any) => setError(e?.response?.data?.detail ?? "Failed to load submissions"))
      .finally(() => setLoading(false));
  }, [cid, sid, me, loadingMe]);

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
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <button className="text-sm text-indigo-600 underline" onClick={() => router.back()}>
        ← Back
      </button>
      <div>
        <h1 className="text-2xl font-bold">Submissions</h1>
        {data && (
          <p className="text-sm text-gray-600">
            {data.student_username ?? data.student_email} ({data.student_email})
          </p>
        )}
      </div>
      {data && data.submissions.length === 0 && (
        <div className="rounded border bg-white p-4 text-sm text-gray-600">No submissions yet.</div>
      )}
      {data && data.submissions.length > 0 && (
        <div className="rounded border bg-white p-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="px-2 py-1">Problem</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Submitted at</th>
                <th className="px-2 py-1">Code</th>
              </tr>
            </thead>
            <tbody>
              {data.submissions.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="px-2 py-1">
                    <div className="font-semibold">{s.problem_title}</div>
                    <div className="text-xs text-gray-500">#{s.problem_id} · {s.problem_slug}</div>
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
