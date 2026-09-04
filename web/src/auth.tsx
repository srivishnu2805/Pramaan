import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "@/api/client";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  ready: boolean; // true once the /auth/me query has settled (success or error)
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = React.useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem("pramaan_token") : null
  );

  const { data: user, isLoading, isError } = useQuery({
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
    // Update state → enabled flips true → React Query fires /auth/me immediately
    setToken(body.access_token);
  };

  const logout = () => {
    localStorage.removeItem("pramaan_token");
    setToken(null);
    qc.removeQueries({ queryKey: ["me"] });
  };

  // ready = no pending fetch: either no token, or the query settled (success or error)
  const ready = !token || (!isLoading && (!!user || isError));

  return (
    <Ctx.Provider value={{ user: user ?? null, loading: isLoading, ready, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
