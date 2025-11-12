import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";

type StudentClass = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  created_at: string | null;
};

export default function StudentClassesPage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me?.role === "student") {
      api
        .get<StudentClass[]>("/student/classes")
        .then((res) => setClasses(res.data))
        .catch((err) => setError(err?.response?.data?.detail ?? "Failed to load classes"));
    }
  }, [loading, me]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (!me) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Classes</h1>
        <p className="mt-2 text-sm text-gray-600">Please log in to see your classes.</p>
        <button
          className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white"
          onClick={() => router.push("/login")}
        >
          Go to login
        </button>
      </div>
    );
  }

  if (me.role !== "student") {
    router.replace("/teacher/classes");
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">My Classes</h1>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      {classes.length === 0 && (
        <div className="mt-4 rounded border bg-white p-4 text-sm text-gray-600">
          You are not enrolled in any classes yet.
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {classes.map((cls) => (
          <li
            key={cls.id}
            className="rounded border border-gray-200 bg-white p-4 text-sm hover:border-indigo-400"
          >
            <div className="font-semibold text-gray-900">{cls.name}</div>
            {cls.description && <div className="text-xs text-gray-500">{cls.description}</div>}
            <div className="mt-2 text-xs text-gray-500">Code: {cls.code}</div>
            <button
              className="mt-3 rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              onClick={() => router.push(`/student/classes/${cls.id}`)}
            >
              View problems
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
