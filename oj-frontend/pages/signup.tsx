import { useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signup = async () => {
    setLoading(true); setMsg(null);
    try {
      await api.post("/auth/register", { email, password: pw });
      setMsg("Registered! Go to login.");
    } catch (e: any) {
      setMsg("Signup failed (maybe email already used)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-bold">Sign up</h1>
      <input className="w-full rounded border p-2" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" placeholder="password" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
      <button onClick={signup} disabled={loading} className="rounded bg-green-600 px-4 py-2 text-white">
        {loading ? "Creating..." : "Create account"}
      </button>
      {msg && <div className="text-sm text-gray-600">{msg}</div>}
      <div className="text-sm text-gray-600">
        Already have an account? <Link className="text-indigo-600 underline" href="/login">Login</Link>
      </div>
    </div>
  );
}