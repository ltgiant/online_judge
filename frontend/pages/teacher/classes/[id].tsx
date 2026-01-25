import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type {
  ClassProblem,
  ClassSubmission,
  TeacherClassDetail,
  ProblemCreatePayload,
  ProblemDetail,
} from "@/lib/types";

export default function TeacherClassDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const classId = typeof id === "string" ? Number(id) : NaN;

  const { me, loading } = useMe();
  const [classDetail, setClassDetail] = useState<TeacherClassDetail | null>(null);
  const [classProblems, setClassProblems] = useState<ClassProblem[]>([]);
  const [classSubmissions, setClassSubmissions] = useState<ClassSubmission[]>([]);
  const [studentEmail, setStudentEmail] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const DEFAULT_STARTER = `def answer(...):
    # TODO: implement
    return None
`;
  const [newProblem, setNewProblem] = useState<ProblemCreatePayload>({
    slug: "",
    title: "",
    difficulty: "easy",
    statement_md: "",
    starter_code: DEFAULT_STARTER,
  });
  const [robotConfig, setRobotConfig] = useState<string>(
`{
  "grid": { "width": 10, "height": 10 },
  "start": { "x": 1, "y": 1, "dir": "top" },
  "walls": [],
  "coins": [],
  "goal": { "final": { "x": 1, "y": 1, "dir": "top" } }
}`
  );
  const [csvProblemId, setCsvProblemId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manageProblem, setManageProblem] = useState<ProblemDetail | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageVisible, setManageVisible] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProblemWeek, setNewProblemWeek] = useState<string>("");
  const [manageWeek, setManageWeek] = useState<string>("");
  const [newProblemCsv, setNewProblemCsv] = useState<File | null>(null);

  const [weekOptions, setWeekOptions] = useState<number[]>([]);
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});
  const [orderSaving, setOrderSaving] = useState<Record<string, boolean>>({});

  const isTeacher = me && (me.role === "teacher" || me.role === "admin");

  useEffect(() => {
    if (!loading && isTeacher && Number.isInteger(classId)) {
      void fetchAll();
    }
  }, [loading, isTeacher, classId]);

  const fetchAll = async () => {
    await Promise.all([fetchClassDetail(), fetchClassWeeks(), fetchClassProblems(), fetchClassSubmissions()]);
  };

  const fetchClassDetail = async () => {
    if (!Number.isInteger(classId)) return;
    try {
      const { data } = await api.get<TeacherClassDetail>(`/teacher/classes/${classId}`);
      setClassDetail(data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load class");
    }
  };

  const fetchClassWeeks = async () => {
    if (!Number.isInteger(classId)) return;
    try {
      const { data } = await api.get<Array<{ week_no: number }>>(`/teacher/classes/${classId}/weeks`);
      const weeks = data.map((w) => w.week_no).sort((a, b) => a - b);
      setWeekOptions(weeks);
      if (!newProblemWeek && weeks.length > 0) {
        setNewProblemWeek(String(weeks[0]));
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load weeks");
    }
  };

  const fetchClassProblems = async () => {
    if (!Number.isInteger(classId)) return;
    try {
      const { data } = await api.get<ClassProblem[]>(`/teacher/classes/${classId}/problems`);
      setClassProblems(data);
      setWeekOptions((prev) => {
        const merged = new Set(prev);
        data.forEach((p) => p.week && merged.add(p.week));
        return Array.from(merged).sort((a, b) => a - b);
      });
      if (!csvProblemId && data.length > 0) {
        setCsvProblemId(String(data[0].id));
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load class problems");
    }
  };

  const fetchClassSubmissions = async () => {
    if (!Number.isInteger(classId)) return;
    try {
      const { data } = await api.get<ClassSubmission[]>(`/teacher/classes/${classId}/submissions`);
      setClassSubmissions(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load submissions");
    }
  };

  const handleAddStudent = async () => {
    if (!Number.isInteger(classId)) return;
    if (!studentEmail.trim()) {
      setError("Student email is required");
      return;
    }
    try {
      await api.post(`/teacher/classes/${classId}/students`, {
        student_email: studentEmail.trim(),
      });
      setStatus("Student added to class");
      setStudentEmail("");
      setError(null);
      await fetchClassDetail();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to add student");
    }
  };

  const handleAddTeacher = async () => {
    if (!Number.isInteger(classId)) return;
    if (!teacherEmail.trim()) {
      setError("Teacher email is required");
      return;
    }
    try {
      await api.post(`/teacher/classes/${classId}/teachers`, {
        teacher_email: teacherEmail.trim(),
      });
      setStatus("Teacher added to class");
      setTeacherEmail("");
      setError(null);
      await fetchClassDetail();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to add teacher");
    }
  };

  const handleCreateProblemForClass = async () => {
    if (!Number.isInteger(classId)) return;
    const { slug, title, difficulty, statement_md, starter_code } = newProblem;
    if (!slug.trim() || !title.trim() || !statement_md.trim() || !newProblemWeek.trim()) {
      setError("Slug, title, statement, and week are required");
      return;
    }
    const weekValue = Number(newProblemWeek);
    if (!weekOptions.includes(weekValue)) {
      setError("Select a week from the existing week list.");
      return;
    }
    try {
      const { data } = await api.post(`/teacher/classes/${classId}/problems`, {
        week: weekValue,
        new_problem: {
          slug: slug.trim(),
          title: title.trim(),
          difficulty,
          statement_md: statement_md.trim(),
          starter_code: starter_code?.trim() || undefined,
        },
      });
      const createdProblemId = data?.problem_id;
      if (createdProblemId && newProblemCsv) {
        const formData = new FormData();
        formData.append("file", newProblemCsv);
        formData.append("replace", "true");
        await api.post(
          `/teacher/classes/${classId}/problems/${createdProblemId}/testcases/upload`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
      }
      setStatus("Problem created & assigned to class");
      setNewProblem({
        slug: "",
        title: "",
        difficulty: "easy",
        statement_md: "# Problem statement\n\nDescribe the problem here.",
        starter_code: DEFAULT_STARTER,
      });
      setNewProblemWeek("");
      setNewProblemCsv(null);
      setShowCreateForm(false);
      setError(null);
      await fetchClassProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create problem");
    }
  };

  const handleCreateRobotProblemForClass = async () => {
    if (!Number.isInteger(classId)) return;
    const { slug, title, difficulty, statement_md, starter_code } = newProblem;
    if (!slug.trim() || !title.trim() || !statement_md.trim() || !newProblemWeek.trim()) {
      setError("Slug, title, statement, and week are required");
      return;
    }
    const weekValue = Number(newProblemWeek);
    if (!weekOptions.includes(weekValue)) {
      setError("Select a week from the existing week list.");
      return;
    }
    let config: any = null;
    try {
      config = JSON.parse(robotConfig);
    } catch {
      setError("Robot config must be valid JSON");
      return;
    }
    try {
      const { data } = await api.post(`/teacher/classes/${classId}/robot-problems`, {
        week: weekValue,
        slug: slug.trim(),
        title: title.trim(),
        difficulty,
        statement_md: statement_md.trim(),
        starter_code: starter_code?.trim() || undefined,
        config,
      });
      setStatus("Robot problem created & assigned to class");
      setNewProblem({
        slug: "",
        title: "",
        difficulty: "easy",
        statement_md: "# Problem statement\n\nDescribe the problem here.",
        starter_code: DEFAULT_STARTER,
      });
      setRobotConfig(`{\n  \"grid\": { \"width\": 10, \"height\": 10 },\n  \"start\": { \"x\": 1, \"y\": 1, \"dir\": \"top\" },\n  \"walls\": [],\n  \"coins\": [],\n  \"goal\": { \"final\": { \"x\": 1, \"y\": 1, \"dir\": \"top\" } }\n}`);
      setNewProblemWeek("");
      setNewProblemCsv(null);
      setShowCreateForm(false);
      setError(null);
      setStatus(data?.detail ?? "Robot problem created & assigned to class");
      await fetchClassProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create robot problem");
    }
  };

  const fetchManageProblem = async (problemId: number) => {
    setManageLoading(true);
    setManageError(null);
    try {
      const { data } = await api.get<ProblemDetail>(`/problems/${problemId}`);
      setManageProblem(data);
    } catch (e: any) {
      setManageError(e?.response?.data?.detail ?? "Failed to load problem details");
      setManageProblem(null);
    } finally {
      setManageLoading(false);
    }
  };

  const handleUpdateProblem = async () => {
    if (!Number.isInteger(classId)) return;
    if (!csvProblemId) {
      setError("Select a problem to manage.");
      return;
    }
    if (!manageProblem) {
      setError("Load a problem to manage first.");
      return;
    }
    if (!manageWeek.trim()) {
      setError("Select a week for this class problem.");
      return;
    }
    const weekValue = Number(manageWeek);
    if (!weekOptions.includes(weekValue)) {
      setError("Select a week from the existing week list.");
      return;
    }
    try {
      await api.put(`/teacher/classes/${classId}/problems/${csvProblemId}`, {
        title: manageProblem.title,
        difficulty: manageProblem.difficulty,
        statement_md: manageProblem.statement_md,
        starter_code: manageProblem.starter_code,
        week: weekValue,
      });
      setStatus("Problem updated");
      setError(null);
      await fetchClassProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to update problem");
    }
  };

  const handleRemoveProblem = async (problemId: number, title: string) => {
    if (!Number.isInteger(classId)) return;
    if (!confirm(`Remove "${title}" from this class?`)) return;
    try {
      await api.delete(`/teacher/classes/${classId}/problems/${problemId}`);
      setStatus("Problem removed from class");
      setError(null);
      await fetchClassProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to remove problem");
    }
  };

  const handleUploadCsv = async () => {
    if (!Number.isInteger(classId)) return;
    if (!csvProblemId) {
      setError("Select a problem to upload testcases.");
      return;
    }
    if (!csvFile) {
      setError("Select a CSV file to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("replace", replaceExisting ? "true" : "false");
    try {
      await api.post(
        `/teacher/classes/${classId}/problems/${csvProblemId}/testcases/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setStatus("Testcases uploaded");
      setError(null);
      setCsvFile(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to upload CSV");
    }
  };

  if (loading || !Number.isInteger(classId)) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!isTeacher) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Class</h1>
        <p className="mt-2 text-sm text-gray-600">Sign in as a teacher to manage classes.</p>
      </div>
    );
  }

  if (!classDetail) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Class</h1>
        <p className="mt-2 text-sm text-gray-600">{error ?? "Class not found"}</p>
        <button
          className="mt-4 rounded border px-4 py-2 text-sm"
          onClick={() => router.push("/teacher/classes")}
        >
          클래스 목록으로
        </button>
      </div>
    );
  }

  const problemsByWeek = classProblems.reduce<Record<string, ClassProblem[]>>((acc, prob) => {
    const label = prob.week ? `Week ${prob.week}` : "Unscheduled";
    acc[label] = acc[label] || [];
    acc[label].push(prob);
    return acc;
  }, {});
  Object.values(problemsByWeek).forEach((problems) => {
    problems.sort((a, b) => {
      const aOrder = a.order_index ?? 0;
      const bOrder = b.order_index ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.id - b.id;
    });
  });
  weekOptions.forEach((w) => {
    const label = `Week ${w}`;
    if (!problemsByWeek[label]) {
      problemsByWeek[label] = [];
    }
  });
  const orderedWeekKeys = Object.keys(problemsByWeek).sort((a, b) => {
    const aw = Number(a.replace("Week ", "")) || 0;
    const bw = Number(b.replace("Week ", "")) || 0;
    return aw - bw || a.localeCompare(b);
  });

  const toggleWeekOpen = (label: string) => {
    setOpenWeeks((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const moveProblemInWeek = async (label: string, fromIndex: number, toIndex: number) => {
    if (!Number.isInteger(classId)) return;
    if (!label.startsWith("Week ")) return;
    const weekNo = Number(label.replace("Week ", ""));
    if (!Number.isInteger(weekNo)) return;
    const current = problemsByWeek[label] ?? [];
    if (toIndex < 0 || toIndex >= current.length) return;
    const next = current.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const updated = new Map<number, number>();
    next.forEach((p, idx) => updated.set(p.id, idx + 1));
    setClassProblems((prev) =>
      prev.map((p) => (updated.has(p.id) ? { ...p, order_index: updated.get(p.id) } : p))
    );
    setOrderSaving((prev) => ({ ...prev, [label]: true }));
    try {
      await api.put(`/teacher/classes/${classId}/weeks/${weekNo}/problems/order`, {
        problem_ids: next.map((p) => p.id),
      });
      setStatus("Problem order updated");
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to update order");
      await fetchClassProblems();
    } finally {
      setOrderSaving((prev) => ({ ...prev, [label]: false }));
    }
  };

  const handleAddNewWeekBanner = () => {
    if (!Number.isInteger(classId)) return;
    const currentMax = weekOptions.length ? Math.max(...weekOptions) : 0;
    const next = currentMax + 1;
    api
      .post(`/teacher/classes/${classId}/weeks`, { week_no: next })
      .then(() => {
        setWeekOptions((prev) => [...prev, next]);
        if (!newProblemWeek) setNewProblemWeek(String(next));
        if (!manageWeek) setManageWeek(String(next));
        setStatus(`Week ${next} created`);
      })
      .catch((e: any) => setError(e?.response?.data?.detail ?? "Failed to create week"));
  };

  const handleRemoveWeekBanner = (week: number) => {
    const hasProblems = (problemsByWeek[`Week ${week}`] || []).length > 0;
    if (hasProblems) {
      setError("Remove problems from this week before deleting the week.");
      return;
    }
    if (!Number.isInteger(classId)) return;
    api
      .delete(`/teacher/classes/${classId}/weeks/${week}`)
      .then(() => {
        setWeekOptions((prev) => prev.filter((w) => w !== week));
        if (newProblemWeek === String(week)) setNewProblemWeek("");
        if (manageWeek === String(week)) setManageWeek("");
        setStatus(`Week ${week} removed`);
      })
      .catch((e: any) => setError(e?.response?.data?.detail ?? "Failed to remove week"));
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <button
        className="text-sm text-indigo-600 underline"
        onClick={() => router.push("/teacher/classes")}
      >
        ← 클래스 목록으로
      </button>

      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="text-2xl font-bold">{classDetail.name}</div>
        <div className="text-sm text-gray-500">Code: {classDetail.code}</div>
        {classDetail.description && (
          <div className="text-sm text-gray-600 mt-1">{classDetail.description}</div>
        )}
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Teachers</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {classDetail.teachers.map((t) => (
              <li key={t.id}>
                {t.username ?? t.email} &lt;{t.email}&gt;
              </li>
            ))}
            {classDetail.teachers.length === 0 && (
              <li className="text-sm text-gray-500">No teachers yet.</li>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded border p-2 text-sm"
              placeholder="Invite teacher via email"
              value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
            />
            <button
              onClick={handleAddTeacher}
              className="rounded border px-3 py-2 text-xs hover:bg-gray-50"
            >
              추가
            </button>
          </div>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Students</h2>
          {classDetail.students.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No students yet.</p>
          ) : (
            <div className="mt-2 max-h-60 overflow-y-auto">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Email</th>
                    <th className="px-2 py-1 text-right">Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {classDetail.students.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-2 py-1">{s.username ?? "-"}</td>
                      <td className="px-2 py-1">{s.email}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-indigo-100"
                          onClick={() => router.push(`/teacher/classes/${classId}/students/${s.id}/submissions`)}
                        >
                          기록 열기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded border p-2 text-sm"
              placeholder="Add student by email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
            />
            <button
              onClick={handleAddStudent}
              className="rounded border px-3 py-2 text-xs hover:bg-gray-50"
            >
              추가
            </button>
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Class Problems</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            className="rounded border px-3 py-1 font-semibold text-indigo-700 hover:bg-gray-50"
            onClick={handleAddNewWeekBanner}
          >
            새 주차 추가
          </button>
          <span className="text-gray-500">Adds the next week number to the dropdowns.</span>
        </div>
        <div className="mt-3 space-y-4 text-sm">
          {orderedWeekKeys.map((label) => (
            <div key={label} className="rounded border border-gray-200">
              <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border px-2 py-0.5 text-[11px] font-normal text-gray-700 hover:bg-white"
                    onClick={() => toggleWeekOpen(label)}
                  >
                    {openWeeks[label] ? "닫기" : "열기"}
                  </button>
                  <span>
                    {label}
                    <span className="ml-2 text-[11px] font-normal text-gray-500">
                      {problemsByWeek[label].length} problem{problemsByWeek[label].length === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {label.startsWith("Week ") && (problemsByWeek[label]?.length ?? 0) === 0 && (
                    <button
                      className="rounded border px-2 py-0.5 text-[11px] font-normal text-red-600 hover:bg-red-50"
                      onClick={() => handleRemoveWeekBanner(Number(label.replace("Week ", "")))}
                    >
                      주차 삭제
                    </button>
                  )}
                </div>
              </div>
              {openWeeks[label] && (
                <ul className="divide-y">
                  {problemsByWeek[label].length === 0 && (
                    <li className="px-3 py-2 text-xs text-gray-500">No problems in this week yet.</li>
                  )}
                  {problemsByWeek[label].map((p, idx) => (
                    <li key={p.id} className="flex items-start justify-between gap-2 px-3 py-2">
                      <div>
                        <div className="font-semibold">
                          {p.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          Slug: {p.slug} · Difficulty: {p.difficulty}
                        </div>
                        {p.assigned_by_name && (
                          <div className="text-xs text-gray-500">
                            Assigned by {p.assigned_by_name}
                          </div>
                        )}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            className="rounded border px-2 py-1 text-[11px] hover:bg-white"
                            onClick={() => {
                              if (Number.isInteger(classId)) {
                                void router.push(
                                  `/teacher/classes/${classId}/problems/${p.id}/submissions`,
                                );
                              }
                            }}
                          >
                            제출 기록
                          </button>
                        </div>
                        {label.startsWith("Week ") && (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              className="rounded border px-2 py-1 text-[11px] hover:bg-white"
                              disabled={orderSaving[label] || idx === 0}
                              onClick={() => moveProblemInWeek(label, idx, idx - 1)}
                            >
                              ▲
                            </button>
                            <button
                              className="rounded border px-2 py-1 text-[11px] hover:bg-white"
                              disabled={
                                orderSaving[label] ||
                                idx === problemsByWeek[label].length - 1
                              }
                              onClick={() => moveProblemInWeek(label, idx, idx + 1)}
                            >
                              ▼
                            </button>
                          </div>
                        )}
                        <div className="flex flex-col items-end gap-1">
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-white"
                          onClick={() => {
                            setStatus(null);
                            setError(null);
                            if (manageVisible && csvProblemId === String(p.id)) {
                              setManageVisible(false);
                              setManageProblem(null);
                              setManageError(null);
                              setManageWeek("");
                              return;
                            }
                            setCsvProblemId(String(p.id));
                            setManageVisible(true);
                            setManageWeek(p.week ? String(p.week) : "");
                            void fetchManageProblem(p.id);
                          }}
                        >
                          열기
                        </button>
                        <button
                          className="rounded border border-red-500 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => handleRemoveProblem(p.id, p.title)}
                        >
                          삭제
                        </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {classProblems.length === 0 && (
            <div className="text-sm text-gray-500">No problems assigned yet.</div>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <button
            className="w-full rounded border px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-gray-50"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? "생성 폼 닫기" : "문제 생성"}
          </button>
          {showCreateForm && (
            <div className="rounded border p-3 text-xs space-y-2">
              <div className="font-semibold text-gray-700">Create new problem (slug/title only)</div>
              <p className="text-[11px] text-gray-500">
                Difficulty defaults to easy, statement uses a placeholder. You can edit details later in Manage.
              </p>
              <input
                className="w-full rounded border p-2"
                placeholder="Slug"
                value={newProblem.slug}
                onChange={(e) => setNewProblem((prev) => ({ ...prev, slug: e.target.value }))}
              />
              <input
                className="w-full rounded border p-2"
                placeholder="Title"
                value={newProblem.title}
                onChange={(e) => setNewProblem((prev) => ({ ...prev, title: e.target.value }))}
              />
              <select
                className="w-full rounded border p-2 text-gray-700"
                value={newProblemWeek}
                onChange={(e) => setNewProblemWeek(e.target.value)}
                disabled={weekOptions.length === 0}
              >
                <option value="">Select Week</option>
                {weekOptions.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded border p-2 text-gray-700"
                value={newProblem.difficulty}
                onChange={(e) =>
                  setNewProblem((prev) => ({ ...prev, difficulty: e.target.value as typeof newProblem.difficulty }))
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <textarea
                className="w-full rounded border p-2 text-xs"
                rows={5}
                placeholder="# Problem statement"
                value={newProblem.statement_md}
                onChange={(e) => setNewProblem((prev) => ({ ...prev, statement_md: e.target.value }))}
              />
              <label className="text-xs font-semibold text-gray-700">Starter code</label>
              <textarea
                className="w-full rounded border p-2 font-mono"
                rows={4}
                placeholder={`def answer(...):\n    # TODO: implement\n    return None`}
                value={newProblem.starter_code ?? ""}
                onChange={(e) =>
                  setNewProblem((prev) => ({
                    ...prev,
                    starter_code: e.target.value,
                  }))
                }
              />
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-gray-700">Upload testcases (CSV)</div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="w-full rounded border p-2 text-sm"
                  onChange={(e) => setNewProblemCsv(e.target.files?.[0] ?? null)}
                />
                <p className="text-[11px] text-gray-500">
                  CSV headers: idx,input_text,expected_text,(optional) timeout_ms,points,is_public.
                </p>
              </div>
              <label className="text-xs font-semibold text-gray-700">Robot config (JSON)</label>
              <textarea
                className="w-full rounded border p-2 font-mono"
                rows={8}
                value={robotConfig}
                onChange={(e) => setRobotConfig(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCreateProblemForClass}
                  className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  생성 및 배정
                </button>
                <button
                  onClick={handleCreateRobotProblemForClass}
                  className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
                >
                  로봇 문제 생성
                </button>
              </div>
            </div>
          )}
          {manageVisible && (
            <div className="rounded border p-3 text-xs space-y-2">
              <div className="font-semibold text-gray-700">Manage selected problem</div>
              {manageLoading && <div className="text-gray-500">Loading problem...</div>}
              {manageError && <div className="text-red-600">{manageError}</div>}
              {!manageProblem && !manageLoading && (
                <div className="text-gray-500">Choose a problem with the Manage button above.</div>
              )}
              {manageProblem && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">{manageProblem.title} <span className="text-xs text-gray-500">(# {manageProblem.id})</span></div>
                  <div className="text-xs text-gray-500">Slug: {manageProblem.slug}</div>
                  <select
                    className="w-full rounded border p-2"
                    value={manageProblem.difficulty}
                    onChange={(e) =>
                      setManageProblem((prev) =>
                        prev ? { ...prev, difficulty: e.target.value as typeof manageProblem.difficulty } : prev
                      )
                    }
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <select
                    className="w-full rounded border p-2"
                    value={manageWeek}
                    onChange={(e) => setManageWeek(e.target.value)}
                  >
                    <option value="">Select Week</option>
                    {weekOptions.map((w) => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="w-full rounded border p-2"
                    rows={4}
                    placeholder="Problem statement (Markdown)"
                    value={manageProblem.statement_md}
                    onChange={(e) =>
                      setManageProblem((prev) =>
                        prev ? { ...prev, statement_md: e.target.value } : prev
                      )
                    }
                  />
                  <label className="text-xs font-semibold text-gray-700">Starter code</label>
                  <textarea
                    className="w-full rounded border p-2 font-mono"
                    rows={4}
                    placeholder={`def answer(...):\n    # TODO: implement\n    return None`}
                    value={manageProblem.starter_code ?? ""}
                    onChange={(e) =>
                      setManageProblem((prev) =>
                        prev ? { ...prev, starter_code: e.target.value } : prev
                      )
                    }
                  />
                  <button
                    onClick={handleUpdateProblem}
                    className="w-full rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                    disabled={!manageProblem}
                  >
                    변경 저장
                  </button>
                </div>
              )}
              <div className="pt-3 border-t">
                <div className="font-semibold text-gray-700 mb-1">Upload testcases (CSV)</div>
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
                  onClick={handleUploadCsv}
                  className="w-full rounded bg-purple-600 px-3 py-2 text-xs font-semibold text-white"
                  disabled={!csvProblemId}
                >
                  CSV 업로드
                </button>
                <p className="text-[11px] text-gray-500">
                  CSV headers: idx,input_text,expected_text,(optional) timeout_ms,points,is_public.
                </p>
                {manageProblem && (
                  <div className="flex justify-end">
                    <button
                      className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                      onClick={() => window.open(`/problems/${manageProblem.id}`, "_blank")}
                    >
                      학생 화면 열기 ↗
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
