import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Activity, Archive, Bell, BookOpen, ChevronRight, ClipboardCheck, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
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
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { data: config } = useQuery<AppConfig>({
    queryKey: ["app-config"],
    queryFn: () => api.get<AppConfig>("/config"),
    staleTime: 60_000,
  });

  const aiEnabled = Boolean(config?.allow_external_ai);

  const links = [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    { to: "/cases", label: "Case files", icon: Archive },
    { to: "/search", label: "Secure search", icon: Search },
    ...(aiEnabled ? [{ to: "/assistant", label: "AI assistant", icon: BookOpen }] : []),
    { to: "/audit", label: "Audit trail", icon: ClipboardCheck },
    ...(user?.role === "admin" ? [{ to: "/users", label: "User access", icon: UsersRound }] : []),
  ];
  const signOut = () => {
    logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen text-[#172321]">
      <header className="sticky top-0 z-30 border-b border-[#d9d8ce]/80 bg-[#f8f6f0]/90 backdrop-blur-md">
        <div className="flex h-[74px] items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#173b3a] text-[#f7f2e8] shadow-[0_5px_14px_rgba(23,59,58,.2)]"><ShieldCheck className="h-5 w-5" /></span>
            <span><span className="block font-display text-xl font-bold leading-none text-[#173b3a]">Pramaan</span><span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.18em] text-[#71807a]">Evidence workspace</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-lg p-2 text-[#60716d] hover:bg-[#e8e6dc] lg:hidden" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button type="button" className="hidden rounded-lg p-2 text-[#60716d] hover:bg-[#e8e6dc] sm:block" aria-label="Notifications"><Bell className="h-5 w-5" /></button>
            <div className="hidden h-8 w-px bg-[#d9d8ce] sm:block" />
            {user && <div className="hidden items-center gap-2 sm:flex"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d7e1d4] text-[#173b3a]"><UserRound className="h-4 w-4" /></span><div className="leading-tight"><p className="text-sm font-semibold">{user.full_name || user.username}</p><p className="text-[10px] uppercase tracking-wider text-[#71807a]">{user.role}</p></div></div>}
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-[74px] left-0 z-20 w-72 border-r border-[#d9d8ce] bg-[#f8f6f0] p-4 transition-transform lg:sticky lg:top-[74px] lg:block lg:h-[calc(100vh-74px)] lg:w-64 lg:translate-x-0`}>
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a9b8f]">Workspace</p>
          <nav className="flex flex-col gap-1">
            {links.map((link) => {
              const Icon = link.icon;
              return <NavLink key={link.to} to={link.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${isActive ? "bg-[#173b3a] text-[#f8f6f0] shadow-[0_6px_16px_rgba(23,59,58,.14)]" : "text-[#60716d] hover:bg-[#e8e6dc] hover:text-[#173b3a]"}`}><Icon className="h-[18px] w-[18px]" /><span>{link.label}</span><ChevronRight className="ml-auto h-4 w-4 opacity-0" /></NavLink>;
            })}
          </nav>
          <div className="absolute bottom-5 left-4 right-4 rounded-2xl border border-[#d9d8ce] bg-[#fffdf8] p-4">
            <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-[#c06f43]" /><span className="text-xs font-semibold text-[#173b3a]">System secure</span><span className="ml-auto h-2 w-2 rounded-full bg-[#5a9a73]" /></div>
            <p className="text-[11px] leading-relaxed text-[#71807a]">Your access is monitored and every record action is tamper-evident.</p>
            {user && <Badge className="mt-3" variant={classificationVariant(user.clearance)}>{user.clearance} clearance</Badge>}
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl">{children}</div></main>
      </div>
      <div className="fixed bottom-5 right-5 z-10 hidden sm:block"><Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button></div>
    </div>
  );
}
