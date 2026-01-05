import { FormEvent, useEffect, useState } from "react";
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
  const [joinCode, setJoinCode] = useState("");
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const loadClasses = async () => {
    try {
      const res = await api.get<StudentClass[]>("/student/classes");
      setClasses(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to load classes");
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Please enter a class code");
      setJoinMessage(null);
      return;
    }
    setJoining(true);
    setJoinError(null);
    setJoinMessage(null);
    try {
      const res = await api.post("/student/classes/join", { code });
      const detail = res.data?.detail ?? "Joined class";
      setJoinMessage(detail);
      setJoinCode("");
      await loadClasses();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail === "Class not exist") {
        setJoinError("Class not exist");
      } else {
        setJoinError(detail ?? "Failed to join class");
      }
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (!loading && me?.role === "student") {
      loadClasses();
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
          로그인으로 이동
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
      {classes.length > 0 && (
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
                문제 보기
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 rounded border border-indigo-100 bg-indigo-50 p-4 text-sm">
        <div className="font-semibold text-gray-900">Join a class with a code</div>
        <p className="mt-1 text-xs text-gray-600">
          Enter the class code provided by your teacher to join the class.
        </p>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleJoin}>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter class code"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:max-w-xs"
          />
          <button
            type="submit"
            disabled={joining}
            className="inline-flex items-center justify-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {joining ? "참여 중..." : "참여"}
          </button>
        </form>
        {joinMessage && <div className="mt-2 text-xs text-green-700">{joinMessage}</div>}
        {joinError && <div className="mt-2 text-xs text-red-600">{joinError}</div>}
      </div>
    </div>
  );
}
