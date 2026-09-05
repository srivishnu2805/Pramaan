import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, ShieldPlus, UsersRound } from "lucide-react";
import { api, type User } from "@/api/client";
import { useAuth } from "@/auth";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, classificationVariant } from "@/components/ui";

const CLEARANCES = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"];
const ROLES = ["viewer", "investigator", "admin"];

export function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [role, setRole] = React.useState("viewer");
  const [clearance, setClearance] = React.useState("UNCLASSIFIED");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/auth/users"),
    enabled: user?.role === "admin",
  });

  const create = useMutation({
    mutationFn: () => api.post<User>("/auth/users", {
      username,
      password,
      full_name: fullName || null,
      department: department || null,
      role,
      clearance,
    }),
    onSuccess: () => {
      setUsername("");
      setPassword("");
      setFullName("");
      setDepartment("");
      setRole("viewer");
      setClearance("UNCLASSIFIED");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  if (user?.role !== "admin") {
    return <div className="mx-auto max-w-lg rounded-2xl border border-[#e5cfc4] bg-[#fff8f4] p-8 text-center"><ShieldPlus className="mx-auto h-10 w-10 text-[#b34f3d]" /><h1 className="mt-4 font-display text-3xl font-bold text-[#173b3a]">Admin access required</h1><p className="mt-2 text-sm leading-relaxed text-[#71807a]">User accounts and clearance assignments can only be managed by an administrator.</p></div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c06f43]">Administration / Access control</p><h1 className="font-display text-4xl font-bold text-[#173b3a]">User access</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-[#71807a]">Create identities and assign the minimum clearance required for the work. Every account change is recorded.</p></div>
      <div className="grid gap-5 xl:grid-cols-[1.05fr_1.4fr]">
        <Card><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5e1d5] text-[#a55439]"><KeyRound className="h-5 w-5" /></div><CardTitle className="mt-4 font-display text-2xl">Create an account</CardTitle><p className="text-sm text-[#71807a]">New users start with viewer access unless explicitly elevated.</p></CardHeader><CardContent><form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="new-username">Username</Label><Input id="new-username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} required /></div><div className="flex flex-col gap-2"><Label htmlFor="new-password">Temporary password</Label><Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></div></div><div className="flex flex-col gap-2"><Label htmlFor="new-full-name">Full name</Label><Input id="new-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor="new-department">Department</Label><Input id="new-department" value={department} onChange={(event) => setDepartment(event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="new-role">Role</Label><select id="new-role" value={role} onChange={(event) => setRole(event.target.value)} className="h-10 rounded-lg border border-[#c9c8bd] bg-[#fffdf8] px-3 text-sm">{ROLES.map((option) => <option key={option}>{option}</option>)}</select></div><div className="flex flex-col gap-2"><Label htmlFor="new-clearance">Clearance</Label><select id="new-clearance" value={clearance} onChange={(event) => setClearance(event.target.value)} className="h-10 rounded-lg border border-[#c9c8bd] bg-[#fffdf8] px-3 text-sm">{CLEARANCES.map((option) => <option key={option}>{option}</option>)}</select></div></div>{create.isError && <p className="text-sm text-[#b34f3d]">{(create.error as Error).message}</p>}{create.isSuccess && <p className="flex items-center gap-2 text-sm text-[#3b7954]"><CheckCircle2 className="h-4 w-4" /> Account created and ready for sign in.</p>}<Button type="submit" disabled={create.isPending} className="mt-2 w-full">{create.isPending ? "Creating account…" : "Create account"}</Button></form></CardContent></Card>
        <Card><CardHeader className="flex-row items-center justify-between"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#9a9b8f]">Directory</p><CardTitle className="font-display text-2xl">Active users</CardTitle></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dbe7e4] text-[#285e59]"><UsersRound className="h-5 w-5" /></span></CardHeader><CardContent className="p-0">{(users ?? []).map((item) => <div key={item.id} className="flex items-center gap-3 border-t border-[#eeeae1] px-6 py-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8e6dc] text-sm font-semibold text-[#49615e]">{(item.full_name || item.username).slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#25413f]">{item.full_name || item.username}</p><p className="text-[11px] text-[#9a9b8f]">@{item.username} · {item.role}</p></div><Badge variant={classificationVariant(item.clearance)}>{item.clearance}</Badge></div>)}{(users ?? []).length === 0 && <p className="p-6 text-sm text-[#71807a]">No active users found.</p>}</CardContent></Card>
      </div>
    </div>
  );
}
