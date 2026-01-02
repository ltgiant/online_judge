import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { ClassProblem } from "@/lib/types";

type TeacherInfo = { id: number; email: string; username: string };

type StudentClassProblem = Pick<ClassProblem, "id" | "slug" | "title" | "difficulty" | "week" | "assigned_at">;

type StudentClassDetail = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  created_at: string | null;
  teachers: TeacherInfo[];
  problems: StudentClassProblem[];
};

export default function StudentClassWeekPage() {
  const router = useRouter();
  const { id, week } = router.query;
  const classId = typeof id === "string" ? Number(id) : NaN;
  const weekParam = Array.isArray(week) ? week[0] : week;
  const autoOpen =
    weekParam &&
    typeof router.query.autoOpen !== "undefined" &&
    (router.query.autoOpen === "1" || router.query.autoOpen === "true" || router.query.autoOpen === "");

  const { me, loading } = useMe();
  const [detail, setDetail] = useState<StudentClassDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const weekNumber = weekParam === "unscheduled" ? null : Number(weekParam);
  const validWeek = weekParam === "unscheduled" || Number.isInteger(weekNumber);
  const weekLabel = weekParam === "unscheduled" ? "Unscheduled" : `Week ${weekNumber}`;

  useEffect(() => {
    if (!loading && me?.role === "student" && Number.isInteger(classId)) {
      api
        .get<StudentClassDetail>(`/student/classes/${classId}`)
        .then((res) => setDetail(res.data))
        .catch((err) => setError(err?.response?.data?.detail ?? "Failed to load class"));
    }
  }, [loading, me, classId]);

  useEffect(() => {
    setPageIndex(0);
  }, [weekParam]);

  const problemsForWeek = useMemo(() => {
    if (!detail || !validWeek) return [];
    const filtered =
      weekNumber === null
        ? detail.problems.filter((p) => !p.week)
        : detail.problems.filter((p) => p.week === weekNumber);
    return filtered
      .slice()
      .sort((a, b) => {
        const aTime = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
        const bTime = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.id - b.id;
      });
  }, [detail, validWeek, weekNumber]);

  useEffect(() => {
    if (pageIndex >= problemsForWeek.length) {
      setPageIndex(Math.max(0, problemsForWeek.length - 1));
    }
  }, [problemsForWeek.length, pageIndex]);

  useEffect(() => {
    if (!autoOpen) return;
    if (!router.isReady) return;
    if (!Number.isInteger(classId)) return;
    if (!weekParam) return;
    if (problemsForWeek.length === 0) return;
    const first = problemsForWeek[0];
    // 새 문제 페이지로 바로 이동
    void router.replace(
      `/problems/${first.id}?classId=${classId}&week=${encodeURIComponent(
        weekParam
      )}&index=0`
    );
  }, [autoOpen, router, classId, weekParam, problemsForWeek]);

  if (loading || !Number.isInteger(classId) || !weekParam) {
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

  if (!validWeek) {
    return (
      <div className="p-6">
        <button
          className="text-sm text-indigo-600 underline"
          onClick={() => router.push(`/student/classes/${classId}`)}
        >
          ← Back to class
        </button>
        <p className="mt-3 text-sm text-red-600">Invalid week.</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <button
          className="text-sm text-indigo-600 underline"
          onClick={() => router.push("/student/classes")}
        >
          ← Back
        </button>
        <p className="mt-3 text-sm text-gray-600">{error ?? "Class not found."}</p>
      </div>
    );
  }

  const current = problemsForWeek[pageIndex];
  const total = problemsForWeek.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between">
        <button
          className="text-sm text-indigo-600 underline"
          onClick={() => router.push(`/student/classes/${classId}`)}
        >
          ← Back to class
        </button>
        <div className="text-sm text-gray-500">Class code: {detail.code}</div>
      </div>

      <div className="mt-4 rounded border bg-white p-5 shadow-sm">
        <div className="text-2xl font-bold text-gray-900">{detail.name}</div>
        <div className="text-sm text-gray-600">
          {weekLabel} · {total} problem{total === 1 ? "" : "s"}
        </div>
      </div>

      <section className="mt-6 rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Problems</h2>
          <div className="text-xs text-gray-500">
            {total === 0 ? "No problems" : `Problem ${pageIndex + 1} of ${total}`}
          </div>
        </div>

        {total === 0 && (
          <p className="mt-3 text-sm text-gray-500">No problems assigned for this week.</p>
        )}

        {current && (
          <div className="mt-3 rounded border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">{current.title}</div>
                <div className="text-xs text-gray-500">Difficulty: {current.difficulty}</div>
                {current.assigned_at && (
                  <div className="mt-1 text-xs text-gray-400">
                    Assigned: {new Date(current.assigned_at).toLocaleString()}
                  </div>
                )}
              </div>
              <Link
                href={`/problems/${current.id}`}
                className="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Open problem
              </Link>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={pageIndex <= 0}
            onClick={() => setPageIndex((idx) => Math.max(0, idx - 1))}
            className={`rounded border px-3 py-1 text-sm ${
              pageIndex <= 0
                ? "cursor-not-allowed border-gray-200 text-gray-300"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Previous
          </button>
          <button
            disabled={pageIndex >= total - 1 || total === 0}
            onClick={() => setPageIndex((idx) => Math.min(total - 1, idx + 1))}
            className={`rounded border px-3 py-1 text-sm ${
              pageIndex >= total - 1 || total === 0
                ? "cursor-not-allowed border-gray-200 text-gray-300"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Next
          </button>
        </div>
      </section>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
