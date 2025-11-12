import axios from "axios";

const base = process.env.NEXT_PUBLIC_API_BASE;
const api = axios.create({
  baseURL: base,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((cfg) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    // auth/login, auth/register 에는 토큰 불필요
    if (token && cfg.url && !cfg.url.startsWith("/auth/")) {
      cfg.headers = cfg.headers ?? {};
      (cfg.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  return cfg;
});

export default api;