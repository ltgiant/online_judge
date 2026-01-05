import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import api from "@/lib/api";

type Status = "idle" | "loading" | "success" | "error" | "missing";

export default function VerifyPage() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) return;
    if (typeof token !== "string") {
      setStatus("missing");
      setMessage("유효하지 않은 인증 링크입니다.");
      return;
    }
    setStatus("loading");
    api
      .get("/auth/verify", { params: { token } })
      .then(() => {
        setStatus("success");
        setMessage("이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.");
      })
      .catch((err) => {
        const detail = err.response?.data?.detail || "링크가 만료되었거나 잘못되었습니다.";
        setStatus("error");
        setMessage(detail);
      });
  }, [token]);

  return (
    <>
      <Head>
        <title>이메일 인증 | Online Judge</title>
      </Head>
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-900/70 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-200 text-xl font-semibold">
              C
            </div>
            <div>
              <p className="text-sm text-slate-300">COTEA Online Judge</p>
              <h1 className="text-xl font-semibold text-slate-50">이메일 인증</h1>
            </div>
          </div>

          {status === "loading" && (
            <p className="text-slate-200">인증 중입니다. 잠시만 기다려 주세요...</p>
          )}

          {status === "missing" && (
            <p className="text-amber-200">
              토큰이 없습니다. 이메일 링크를 다시 확인하거나 인증 메일을 재발송해 주세요.
            </p>
          )}

          {status === "success" && (
            <div className="space-y-3">
              <p className="text-emerald-200 font-medium">{message}</p>
              <button
                onClick={() => router.push("/login")}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2 transition"
              >
                로그인으로 이동
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-3">
              <p className="text-rose-200">{message}</p>
              <div className="space-y-2">
                <button
                  onClick={() => router.push("/login")}
                  className="w-full rounded-lg bg-slate-200 text-slate-900 font-semibold py-2 hover:bg-white transition"
                >
                  로그인 페이지
                </button>
                <button
                  onClick={() => router.push("/signup")}
                  className="w-full rounded-lg bg-slate-800 text-slate-50 font-semibold py-2 hover:bg-slate-700 transition"
                >
                  회원가입 다시 진행
                </button>
              </div>
            </div>
          )}

          {status === "idle" && (
            <p className="text-slate-200">인증 토큰을 확인하는 중입니다...</p>
          )}
        </div>
      </div>
    </>
  );
}
