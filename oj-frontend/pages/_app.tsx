import type { AppProps } from "next/app";
import "@/styles/globals.css";
import NavBar from "@/components/NavBar";


export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="w-full px-2 sm:px-3 lg:px-4 py-6">
        <Component {...pageProps} />
      </main>
    </div>
  );
}
