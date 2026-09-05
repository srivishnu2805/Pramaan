import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AuditEvent, type User } from "@/api/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Activity, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export function AuditPage() {
  const { data: events, refetch, isFetching } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEvent[]>("/audit?limit=100"),
  });
  const { data: verification, refetch: reverify, isFetching: verifying } = useQuery({
    queryKey: ["audit-verify"],
    queryFn: () => api.get<{ valid: boolean; broken: string[] }>("/audit/verify"),
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/auth/users"),
  });

  const usernameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users ?? []) map[u.id] = u.username;
    return map;
  }, [users]);

  const resolveActor = (actor_id: string | null) => {
    if (!actor_id) return <span className="text-slate-400 italic">system</span>;
    return <span className="font-medium">{usernameById[actor_id] ?? actor_id.slice(0, 8) + "…"}</span>;
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c06f43]">Governance / Integrity</p><h1 className="font-display text-4xl font-bold text-[#173b3a]">Audit trail</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71807a]">A chronological record of access, changes, and verification events across your workspace.</p></div>
        {verification && (
          <Badge className="h-8 px-3" variant={verification.valid ? "success" : "destructive"}>
            {verification.valid ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Chain intact</> : `BROKEN (${verification.broken.length})`}
          </Badge>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><Activity className="h-5 w-5 text-[#c06f43]" /><p className="mt-4 text-xs uppercase tracking-[0.1em] text-[#71807a]">Events captured</p><p className="mt-1 font-display text-3xl font-bold text-[#173b3a]">{events?.length ?? 0}</p></Card><Card className="p-5"><ShieldCheck className="h-5 w-5 text-[#4e855f]" /><p className="mt-4 text-xs uppercase tracking-[0.1em] text-[#71807a]">Verification</p><p className="mt-1 font-display text-3xl font-bold text-[#173b3a]">{verification?.valid ? "PASS" : "—"}</p></Card><Card className="flex items-end justify-between p-5"><div><p className="text-xs uppercase tracking-[0.1em] text-[#71807a]">Ledger controls</p><p className="mt-1 text-sm font-semibold text-[#25413f]">Recheck the chain</p></div><Button size="sm" variant="outline" onClick={() => { refetch(); reverify(); }} disabled={isFetching || verifying} aria-label="Refresh audit trail"><RefreshCw className={`h-4 w-4 ${verifying ? "animate-spin" : ""}`} /></Button></Card></div>
      <Card className="overflow-hidden"><CardHeader className="flex-row items-center justify-between border-b border-[#e6e3da] pb-5"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#9a9b8f]">Newest first</p><CardTitle className="font-display text-2xl">Event ledger</CardTitle></div><Badge variant="secondary">SHA-256 chain</Badge></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e6e3da] text-[10px] uppercase tracking-[0.12em] text-[#9a9b8f]">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Object / Ref</th>
                <th className="py-2">Hash</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-b border-[#eeeae1] last:border-0 hover:bg-[#faf8f2]">
                  <td className="whitespace-nowrap py-3 pr-4 text-[#60716d]">{fmt(e.occurred_at)}</td>
                  <td className="py-2 pr-4">{resolveActor(e.actor_id)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-[#25413f]">{e.event_type}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-[#71807a]">{e.object_ref?.slice(0, 24) ?? "—"}</td>
                  <td className="py-3 font-mono text-xs text-[#9a9b8f]">{e.event_hash.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(events ?? []).length === 0 && <p className="text-sm text-slate-500">No events yet.</p>}
        </CardContent>
      </Card>
      <p className="max-w-3xl text-xs leading-relaxed text-[#8a958e]">
        Tamper-evident hash chain (SHA-256). Verification recomputes every link; any rewritten event breaks the
        chain. The chain is tamper-evident, not immutable — production anchors checkpoints to append-only storage.
      </p>
    </div>
  );
}
