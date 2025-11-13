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
          Online Judge (MVP)
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/problems" className="hover:underline">Problems</Link>
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
                Classes
              </Link>
              {me.role === "admin" && (
                <Link href="/admin/public" className="hover:underline">
                  Public
                </Link>
              )}
            </>
          )}
          {!loading && !me && (
            <>
              <Link href="/login" className="hover:underline">Login</Link>
              <Link href="/signup" className="hover:underline">Sign up</Link>
            </>
          )}
          {!loading && me && (
            <>
              <span className="text-gray-700">
                {me.username || me.email}{!me.is_verified && " (unverified)"}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-md border px-2 py-1 hover:bg-gray-50"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
