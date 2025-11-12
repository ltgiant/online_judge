import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { ClassProblem, ClassSubmission, TeacherClassDetail } from "@/lib/types";

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
  const [existingProblemId, setExistingProblemId] = useState("");
  const [newProblem, setNewProblem] = useState({
    slug: "",
    title: "",
    difficulty: "easy",
    statement_md: "",
  });
  const [csvProblemId, setCsvProblemId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = me && (me.role === "teacher" || me.role === "admin");

  useEffect(() => {
    if (!loading && isTeacher && Number.isInteger(classId)) {
      void fetchAll();
    }
  }, [loading, isTeacher, classId]);

  const fetchAll = async () => {
    await Promise.all([fetchClassDetail(), fetchClassProblems(), fetchClassSubmissions()]);
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

  const fetchClassProblems = async () => {
    if (!Number.isInteger(classId)) return;
    try {
      const { data } = await api.get<ClassProblem[]>(`/teacher/classes/${classId}/problems`);
      setClassProblems(data);
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

  const handleAssignExistingProblem = async () => {
    if (!Number.isInteger(classId)) return;
    if (!existingProblemId.trim()) {
      setError("Problem ID is required");
      return;
    }
    const problemIdNumber = Number(existingProblemId);
    if (!Number.isInteger(problemIdNumber) || problemIdNumber <= 0) {
      setError("Problem ID must be a positive integer");
      return;
    }
    try {
      await api.post(`/teacher/classes/${classId}/problems`, {
        problem_id: problemIdNumber,
      });
      setStatus("Problem assigned to class");
      setExistingProblemId("");
      setError(null);
      await fetchClassProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to assign problem");
    }
  };

  const handleCreateProblemForClass = async () => {
    if (!Number.isInteger(classId)) return;
    const { slug, title, difficulty, statement_md } = newProblem;
    if (!slug.trim() || !title.trim() || !statement_md.trim()) {
      setError("Slug, title, and statement are required");
      return;
    }
    try {
      await api.post(`/teacher/classes/${classId}/problems`, {
        new_problem: {
          slug: slug.trim(),
          title: title.trim(),
          difficulty,
          statement_md: statement_md.trim(),
        },
      });
      setStatus("Problem created & assigned to class");
      setNewProblem({
        slug: "",
        title: "",
        difficulty: "easy",
        statement_md: "",
      });
      setError(null);
      await fetchClassProblems();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create problem");
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
          Back to classes
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <button
        className="text-sm text-indigo-600 underline"
        onClick={() => router.push("/teacher/classes")}
      >
        ← Back to classes
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
              Add
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
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classDetail.students.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-2 py-1">{s.username ?? "-"}</td>
                      <td className="px-2 py-1">{s.email}</td>
                      <td className="px-2 py-1">
                        {s.is_verified ? (
                          <span className="text-xs text-green-600">verified</span>
                        ) : (
                          <span className="text-xs text-amber-600">pending</span>
                        )}
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
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Class Problems</h2>
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
          {classProblems.map((p) => (
            <li key={p.id} className="rounded border border-gray-200 p-2 bg-gray-50">
              <div className="font-semibold">
                {p.title} <span className="text-xs text-gray-500">(# {p.id})</span>
              </div>
              <div className="text-xs text-gray-500">
                Slug: {p.slug} · Difficulty: {p.difficulty}
              </div>
              {p.assigned_by_name && (
                <div className="text-xs text-gray-500">
                  Assigned by {p.assigned_by_name}
                </div>
              )}
            </li>
          ))}
          {classProblems.length === 0 && (
            <li className="text-sm text-gray-500">No problems assigned yet.</li>
          )}
        </ul>
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <input
              className="w-full rounded border p-2 text-sm"
              placeholder="Assign existing problem by ID"
              value={existingProblemId}
              onChange={(e) => setExistingProblemId(e.target.value)}
            />
            <button
              onClick={handleAssignExistingProblem}
              className="rounded border px-3 py-2 text-xs hover:bg-gray-50"
            >
              Assign
            </button>
            <button
              className="rounded border border-red-500 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
              disabled={!classProblems.length}
              onClick={async () => {
                if (!Number.isInteger(classId)) return;
                if (!existingProblemId.trim()) {
                  setError("Enter the problem ID you want to remove.");
                  return;
                }
                if (!confirm("Remove this problem from the class?")) return;
                try {
                  await api.delete(`/teacher/classes/${classId}/problems/${existingProblemId}`);
                  setStatus("Problem removed from class");
                  setExistingProblemId("");
                  await fetchClassProblems();
                } catch (e: any) {
                  setError(e?.response?.data?.detail ?? "Failed to remove problem");
                }
              }}
            >
              Remove
            </button>
          </div>
          <div className="rounded border p-3 text-xs space-y-2">
            <div className="font-semibold text-gray-700">Create new problem for this class</div>
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
              className="w-full rounded border p-2"
              value={newProblem.difficulty}
              onChange={(e) => setNewProblem((prev) => ({ ...prev, difficulty: e.target.value }))}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <textarea
              className="w-full rounded border p-2"
              rows={4}
              placeholder="Problem statement (Markdown)"
              value={newProblem.statement_md}
              onChange={(e) =>
                setNewProblem((prev) => ({ ...prev, statement_md: e.target.value }))
              }
            />
            <button
              onClick={handleCreateProblemForClass}
              className="w-full rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Create & assign
            </button>
          </div>
          <div className="rounded border p-3 text-xs space-y-2">
            <div className="font-semibold text-gray-700">Upload testcases (CSV)</div>
            <select
              className="w-full rounded border p-2"
              value={csvProblemId}
              onChange={(e) => setCsvProblemId(e.target.value)}
            >
              <option value="">Select a problem</option>
              {classProblems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
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
            >
              Upload CSV
            </button>
            <p className="text-[11px] text-gray-500">
              CSV headers: idx,input_text,expected_text,(optional) timeout_ms,points,is_public.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Recent Submissions</h2>
        <div className="mt-3 max-h-64 overflow-y-auto text-xs">
          <table className="w-full text-left text-gray-600">
            <thead>
              <tr className="text-gray-500">
                <th className="px-2 py-1">Student</th>
                <th className="px-2 py-1">Problem</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Time</th>
              </tr>
            </thead>
            <tbody>
              {classSubmissions.map((s) => (
                <tr key={s.submission_id} className="border-t">
                  <td className="px-2 py-1">{s.student_username}</td>
                  <td className="px-2 py-1">{s.problem_title}</td>
                  <td className="px-2 py-1">{s.status}</td>
                  <td className="px-2 py-1">{s.score}</td>
                  <td className="px-2 py-1">{s.time_ms ?? 0} ms</td>
                </tr>
              ))}
              {classSubmissions.length === 0 && (
                <tr>
                  <td className="px-2 py-2 text-gray-500" colSpan={5}>
                    No submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
