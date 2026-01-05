import Link from "next/link";
import { useRouter } from "next/router";
import { useMe } from "@/lib/useMe";

export default function NavBar() {
  const router = useRouter();
  const { me, loading, logout } = useMe();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-gray-900 hover:underline">
          Code Teacher
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {!loading && !!me && (
            <Link href="/problems" className="hover:underline">문제</Link>
          )}
          {!loading && me && (
            <>
              <Link
                href={
                  me.role === "teacher" || me.role === "admin"
                    ? "/teacher/classes"
                    : "/student/classes"
                }
                className="hover:underline"
              >
                클래스
              </Link>
              {me.role === "admin" && (
                <Link href="/admin/public" className="hover:underline">
                  공개
                </Link>
              )}
            </>
          )}
          {!loading && !me && (
            <>
              <Link href="/login" className="hover:underline">로그인</Link>
              <Link href="/signup" className="hover:underline">회원가입</Link>
            </>
          )}
          {!loading && me && (
            <>
              <span className="text-gray-700">
                {me.username || me.email}{!me.is_verified && " (미인증)"}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-md border px-2 py-1 hover:bg-gray-50"
              >
                로그아웃
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
