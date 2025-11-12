import Link from "next/link";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function NavBar() {
  const [me, setMe] = useState<{ id: number; email: string; role: string } | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    api.get("/me")
      .then((r) => setMe(r.data))
      .catch(() => setMe(null));
  }, []);

  const logout = () => {
    localStorage.removeItem("access_token");
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-gray-900">Online Judge (MVP)</Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/problems" className="text-gray-700 hover:underline">Problems</Link>
          {me ? (
            <>
              <span className="text-gray-500">|</span>
              <span className="text-gray-700">{me.email}</span>
              <button onClick={logout} className="rounded bg-gray-800 px-3 py-1 text-white">Logout</button>
            </>
          ) : (
            <>
              <span className="text-gray-500">|</span>
              <Link href="/login" className="rounded bg-indigo-600 px-3 py-1 text-white">Login</Link>
              <Link href="/signup" className="rounded border px-3 py-1 text-gray-800">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}