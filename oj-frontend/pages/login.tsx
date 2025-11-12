import { useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await api.post("/auth/login", { email, password: pw });
      localStorage.setItem("access_token", r.data.access_token);
      setMsg("Logged in. Redirecting...");
      window.location.href = "/"; // 또는 문제 목록으로
    } catch {
      setMsg("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-bold">Login</h1>
      <input className="w-full rounded border p-2" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" placeholder="password" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
      <button onClick={login} disabled={loading} className="rounded bg-indigo-600 px-4 py-2 text-white">
        {loading ? "Signing in..." : "Login"}
      </button>
      {msg && <div className="text-sm text-gray-600">{msg}</div>}
      <div className="text-sm text-gray-600">
        No account? <Link className="text-indigo-600 underline" href="/signup">Sign up</Link>
      </div>
    </div>
  );
}