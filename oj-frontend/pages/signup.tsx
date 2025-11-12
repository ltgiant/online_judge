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

  const signup = async () => {
    setLoading(true);
    setMsg(null);
    setVerifyInfo(null);
    if (!email.trim() || !username.trim()) {
      setMsg("Email and username are required");
      setLoading(false);
      return;
    }
    if (pw !== pwConfirm) {
      setMsg("Passwords do not match");
      setLoading(false);
      return;
    }
    if (pw.length < 8) {
      setMsg("Password must be at least 8 characters");
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
        setMsg("Registered! Check your email for a verification link.");
      } else if (data.email_delivery === "failed") {
        setMsg(
          `Registered, but email could not be sent${data.email_error ? `: ${data.email_error}` : "."}`
        );
      } else {
        setMsg("Registered! Use the link below to verify (dev mode).");
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setMsg(detail ?? "Signup failed (maybe email already used)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-bold">Sign up</h1>
      <input
        className="w-full rounded border p-2"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="password"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="confirm password"
        type="password"
        value={pwConfirm}
        onChange={(e) => setPwConfirm(e.target.value)}
      />
      <button
        onClick={signup}
        disabled={loading}
        className="rounded bg-green-600 px-4 py-2 text-white"
      >
        {loading ? "Creating..." : "Create account"}
      </button>
      {msg && <div className="text-sm text-gray-600">{msg}</div>}
      {verifyInfo?.verify_url && (
        <div className="rounded border border-dashed border-green-500 p-3 text-sm">
          <div className="font-semibold text-green-700">Dev verify link</div>
          <a className="text-indigo-600 underline" href={verifyInfo.verify_url}>
            {verifyInfo.verify_url}
          </a>
        </div>
      )}
      <div className="text-sm text-gray-600">
        Already have an account?{" "}
        <Link className="text-indigo-600 underline" href="/login">
          Login
        </Link>
      </div>
    </div>
  );
}
