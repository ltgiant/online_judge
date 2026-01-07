import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { ClassProblem } from "@/lib/types";

type TeacherInfo = { id: number; email: string; username: string };

type StudentClassDetail = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  created_at: string | null;
  teachers: TeacherInfo[];
  problems: Array<Pick<ClassProblem, "id" | "slug" | "title" | "difficulty" | "week" | "order_index">>;
};

export default function StudentClassDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const classId = typeof id === "string" ? Number(id) : NaN;

  const { me, loading } = useMe();
  const [detail, setDetail] = useState<StudentClassDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me?.role === "student" && Number.isInteger(classId)) {
      api
        .get<StudentClassDetail>(`/student/classes/${classId}`)
        .then((res) => setDetail(res.data))
        .catch((err) => setError(err?.response?.data?.detail ?? "Failed to load class"));
    }
  }, [loading, me, classId]);

  if (loading || !Number.isInteger(classId)) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!me) {
    router.replace("/login");
    return null;
  }

  if (me.role !== "student") {
    router.replace("/teacher/classes");
    return null;
  }

  if (!detail) {
    return (
      <div className="p-6">
        <button
          className="text-sm text-indigo-600 underline"
          onClick={() => router.push("/student/classes")}
        >
          ← 돌아가기
        </button>
        <p className="mt-3 text-sm text-gray-600">{error ?? "Class not found."}</p>
      </div>
    );
  }

  const problemsByWeek = (detail?.problems || []).reduce<Record<string, typeof detail.problems>>((acc, prob) => {
    const weekLabel = prob.week ? `Week ${prob.week}` : "Unscheduled";
    acc[weekLabel] = acc[weekLabel] || [];
    acc[weekLabel].push(prob);
    return acc;
  }, {});
  const orderedWeekKeys = Object.keys(problemsByWeek).sort((a, b) => {
    const aw = Number(a.replace("Week ", "")) || 0;
    const bw = Number(b.replace("Week ", "")) || 0;
    return aw - bw || a.localeCompare(b);
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <button
        className="text-sm text-indigo-600 underline"
        onClick={() => router.push("/student/classes")}
      >
        ← 클래스 목록으로
      </button>
      <div className="mt-4 rounded border bg-white p-5 shadow-sm">
        <div className="text-2xl font-bold text-gray-900">{detail.name}</div>
        <div className="text-sm text-gray-500">Code: {detail.code}</div>
        {detail.description && (
          <div className="mt-2 text-sm text-gray-600">{detail.description}</div>
        )}
      </div>

      <section className="mt-6 rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Teachers</h2>
        <ul className="mt-2 text-sm text-gray-700">
          {detail.teachers.map((t) => (
            <li key={t.id}>
              {t.username ?? t.email} &lt;{t.email}&gt;
            </li>
          ))}
          {detail.teachers.length === 0 && (
            <li className="text-sm text-gray-500">No teachers listed.</li>
          )}
        </ul>
      </section>

      <section className="mt-6 rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Assigned Problems</h2>
        {detail.problems.length === 0 && (
          <p className="text-sm text-gray-500">No problems assigned yet.</p>
        )}
        <div className="mt-2 space-y-4 text-sm">
          {orderedWeekKeys.map((label) => (
            <div key={label} className="rounded border border-gray-200">
              <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                <span>
                  {label}
                  <span className="ml-2 text-[11px] font-normal text-gray-500">
                    {problemsByWeek[label].length} problem{problemsByWeek[label].length === 1 ? "" : "s"}
                  </span>
                </span>
                {problemsByWeek[label].length > 0 ? (
                  <Link
                    href={`/problems/${problemsByWeek[label][0].id}?classId=${classId}&week=${
                      label === "Unscheduled" ? "unscheduled" : label.replace("Week ", "")
                    }&index=0`}
                    className="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    열기
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded border border-gray-200 px-3 py-1 text-xs text-gray-300"
                  >
                    열기
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
