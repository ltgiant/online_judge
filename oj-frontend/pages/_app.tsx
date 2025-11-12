import type { AppProps } from "next/app";
import "@/styles/globals.css";
import NavBar from "@/components/NavBar";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Component {...pageProps} />
      </main>
    </div>
  );
}