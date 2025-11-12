// oj-frontend/lib/useMe.ts
import { useCallback, useEffect, useState } from "react";
import api from "./api";

export type Me = { id:number; email:string; username?:string|null; role:string; is_verified:boolean };

function getAccessToken() {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setMe(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const r = await api.get<Me>("/me");
      setMe(r.data);
      return r.data;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "access_token") {
        void fetchMe();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    }
  }, [fetchMe]);

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
    }
    setMe(null);
    setLoading(false);
  }, []);

  return {
    me,
    loading,
    refresh: fetchMe,
    logout,
  };
}
