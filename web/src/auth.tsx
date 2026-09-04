import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "@/api/client";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("pramaan_token") : null;
  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<User>("/auth/me"),
    enabled: !!token,
    retry: false,
  });

  const login = async (username: string, password: string) => {
    const form = new URLSearchParams({ username, password });
    const res = await fetch("/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) throw new Error("Invalid username or password");
    const body = await res.json();
    localStorage.setItem("pramaan_token", body.access_token);
    await qc.invalidateQueries({ queryKey: ["me"] });
  };

  const logout = () => {
    localStorage.removeItem("pramaan_token");
    qc.setQueryData(["me"], null);
  };

  return (
    <Ctx.Provider value={{ user: user ?? null, loading: isLoading, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
