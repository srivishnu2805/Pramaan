import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth";
import { api } from "@/api/client";
import { Button, Badge, classificationVariant } from "@/components/ui";

interface AppConfig {
  allow_external_ai: boolean;
  has_openai_key: boolean;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { data: config } = useQuery<AppConfig>({
    queryKey: ["app-config"],
    queryFn: () => api.get<AppConfig>("/config"),
    staleTime: 60_000,
  });

  const aiEnabled = Boolean(config?.allow_external_ai);

  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/cases", label: "Cases" },
    { to: "/search", label: "Secure Search" },
    ...(aiEnabled ? [{ to: "/assistant", label: "AI Assistant" }] : []),
    { to: "/audit", label: "Audit" },
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-5 w-5" /> Pramaan
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <>
                <span className="text-sm text-slate-600">{user.username}</span>
                <Badge variant={classificationVariant(user.clearance)}>{user.clearance}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    logout();
                    nav("/login");
                  }}
                >
                  Logout
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
