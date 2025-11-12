import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { TeacherClass } from "@/lib/types";

export default function TeacherClassesListPage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = me && (me.role === "teacher" || me.role === "admin");

  useEffect(() => {
    if (!loading && isTeacher) {
      void fetchClasses();
    }
  }, [loading, isTeacher]);

  const fetchClasses = async () => {
    try {
      const { data } = await api.get<TeacherClass[]>("/teacher/classes");
      setClasses(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load classes");
    }
  };

  const handleCreateClass = async () => {
    if (!createName.trim()) {
      setError("Class name is required");
      return;
    }
    try {
      const { data } = await api.post("/teacher/classes", {
        name: createName,
        description: createDesc || null,
      });
      setStatus(`Created class ${data.name ?? ""} (code: ${data.code})`);
      setCreateName("");
      setCreateDesc("");
      setError(null);
      await fetchClasses();
      if (data.class_id) {
        router.push(`/teacher/classes/${data.class_id}`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create class");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!isTeacher) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Classes</h1>
        <p className="mt-2 text-sm text-gray-600">
          You need a teacher or admin account to manage classes.
        </p>
        {!me && (
          <button
            onClick={() => router.push("/login")}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white"
          >
            Go to login
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">My Classes</h1>
        <p className="text-sm text-gray-600">
          Create a classroom or select one below to manage it.
        </p>
      </div>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Create a Class</h2>
        <div className="mt-3 flex flex-col gap-3 md:flex-row">
          <input
            className="w-full rounded border p-2"
            placeholder="Class name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <input
            className="w-full rounded border p-2"
            placeholder="Description (optional)"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
          />
          <button
            onClick={handleCreateClass}
            className="rounded bg-green-600 px-4 py-2 text-white"
          >
            Create
          </button>
        </div>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Class List</h2>
        {classes.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">No classes yet.</p>
        )}
        <ul className="mt-3 space-y-2">
          {classes.map((cls) => (
            <li
              key={cls.id}
              className="rounded border border-gray-200 p-3 text-sm hover:border-indigo-400 hover:bg-indigo-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{cls.name}</div>
                  <div className="text-xs text-gray-500">Code: {cls.code}</div>
                  <div className="text-xs text-gray-500">
                    Students: {cls.student_count}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    className="rounded border px-3 py-1 text-xs hover:bg-gray-50"
                    onClick={() => router.push(`/teacher/classes/${cls.id}`)}
                  >
                    Manage
                  </button>
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={async () => {
                      if (!confirm(`Delete class \"${cls.name}\"? This cannot be undone.`)) return;
                      try {
                        await api.delete(`/teacher/classes/${cls.id}`);
                        setStatus(`Deleted class ${cls.name}`);
                        await fetchClasses();
                      } catch (e: any) {
                        setError(e?.response?.data?.detail ?? "Failed to delete class");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
