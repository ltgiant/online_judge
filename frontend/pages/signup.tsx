import { useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

type RegisterResponse = {
  user_id: number;
  email: string;
  verify_expires: string;
  verify_token?: string;
  verify_url?: string;
  email_delivery?: "sent" | "failed" | "dev_echo";
  email_error?: string;
};

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [verifyInfo, setVerifyInfo] = useState<RegisterResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const signup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setMsg(null);
    setVerifyInfo(null);
    if (!email.trim() || !username.trim()) {
      setMsg("이메일과 사용자명이 필요합니다");
      setLoading(false);
      return;
    }
    if (pw !== pwConfirm) {
      setMsg("비밀번호가 일치하지 않습니다");
      setLoading(false);
      return;
    }
    if (pw.length < 8) {
      setMsg("비밀번호는 최소 8자 이상이어야 합니다");
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.post<RegisterResponse>("/auth/register", {
        email: email.trim(),
        username: username.trim(),
        password: pw,
        password_confirm: pwConfirm,
      });
      setVerifyInfo(data);
      if (data.email_delivery === "sent") {
        setMsg("가입 완료! 이메일 인증 링크를 확인하세요.");
      } else if (data.email_delivery === "failed") {
        setMsg(
          `가입 완료, 하지만 이메일 발송에 실패했습니다${data.email_error ? `: ${data.email_error}` : "."}`
        );
      } else {
        setMsg("가입 완료! 아래 링크로 인증하세요(개발 모드).");
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setMsg(detail ?? "회원가입 실패(이미 사용 중인 이메일일 수 있음)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="mx-auto max-w-md space-y-3" onSubmit={signup}>
      <h1 className="text-xl font-bold">회원가입</h1>
      <input
        className="w-full rounded border p-2"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="사용자명"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="비밀번호"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="비밀번호 확인"
        type="password"
        value={pwConfirm}
        onChange={(e) => setPwConfirm(e.target.value)}
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-green-600 px-4 py-2 text-white"
      >
        {loading ? "생성 중..." : "계정 만들기"}
      </button>
      {msg && <div className="text-sm text-gray-600">{msg}</div>}
      {verifyInfo?.verify_url && (
        <div className="rounded border border-dashed border-green-500 p-3 text-sm">
          <div className="font-semibold text-green-700">개발용 인증 링크</div>
          <a className="text-indigo-600 underline" href={verifyInfo.verify_url}>
            {verifyInfo.verify_url}
          </a>
        </div>
      )}
      <div className="text-sm text-gray-600">
        이미 계정이 있나요?{" "}
        <Link className="text-indigo-600 underline" href="/login">
          로그인
        </Link>
      </div>
    </form>
  );
}
