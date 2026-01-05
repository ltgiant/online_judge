import { useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const r = await api.post("/auth/login", { email, password: pw });
      localStorage.setItem("access_token", r.data.access_token);
      setMsg("로그인 완료. 이동 중...");
      window.location.href = "/"; // 또는 문제 목록으로
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setMsg(detail ?? "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="mx-auto max-w-md space-y-3" onSubmit={login}>
      <h1 className="text-xl font-bold">로그인</h1>
      <input className="w-full rounded border p-2" placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" placeholder="비밀번호" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
      <button type="submit" disabled={loading} className="rounded bg-indigo-600 px-4 py-2 text-white">
        {loading ? "로그인 중..." : "로그인"}
      </button>
      {msg && <div className="text-sm text-gray-600">{msg}</div>}
      <div className="text-sm text-gray-600">
        계정이 없나요? <Link className="text-indigo-600 underline" href="/signup">회원가입</Link>
      </div>
    </form>
  );
}
