import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Redirect once /auth/me resolves with a real user — no race with the fetch
  React.useEffect(() => {
    if (user) nav("/", { replace: true });
  }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      // nav happens via useEffect above once user is populated
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f1e9] px-5 py-8 lg:grid lg:grid-cols-[1.15fr_.85fr] lg:gap-16 lg:px-16 lg:py-12">
      <div className="relative hidden overflow-hidden rounded-3xl bg-[#173b3a] p-10 text-[#f8f6f0] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-[#c06f43]/30" />
        <div><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f8f6f0] text-[#173b3a]"><ShieldCheck className="h-6 w-6" /></span><span className="font-display text-2xl font-bold">Pramaan</span></div><p className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#b9ceca]">Secure evidence workspace</p></div>
        <div className="relative max-w-xl"><p className="font-display text-5xl font-bold leading-[1.05]">Proof you can stand behind.</p><p className="mt-5 max-w-md text-sm leading-relaxed text-[#b9ceca]">A controlled workspace for sensitive records, accountable decisions, and evidence that stays verifiable from intake to archive.</p><div className="mt-8 flex items-center gap-3 text-xs text-[#d9a57c]"><LockKeyhole className="h-4 w-4" /> Authorization enforced before retrieval</div></div>
        <div className="flex items-center justify-between border-t border-[#3d6460] pt-5 text-[10px] uppercase tracking-[0.16em] text-[#8fb0a9]"><span>Pramaan / 2026</span><span className="flex items-center gap-1">Tamper-evident by design <ArrowUpRight className="h-3 w-3" /></span></div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col justify-center py-12 lg:max-w-sm">
        <div className="mb-8 lg:hidden"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#173b3a] text-[#f8f6f0]"><ShieldCheck className="h-5 w-5" /></span><span className="font-display text-2xl font-bold text-[#173b3a]">Pramaan</span></div></div>
        <div className="mb-8"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c06f43]">Restricted access</p><h1 className="mt-3 font-display text-4xl font-bold text-[#173b3a]">Welcome back.</h1><p className="mt-2 text-sm text-[#71807a]">Sign in to continue to your evidence workspace.</p></div>
        <Card>
          <CardHeader><CardTitle className="text-lg">Sign in securely</CardTitle></CardHeader>
          <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="mt-2 h-11">{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-[11px] leading-relaxed text-[#8a958e]">Access is logged and evaluated against your assigned clearance.</p>
    </div>
    </div>
  );
}
