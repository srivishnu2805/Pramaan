import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, Clock3, FileCheck2, FolderOpen, LockKeyhole, Plus, ScanSearch, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type AuditEvent, type Case } from "@/api/client";
import { useAuth } from "@/auth";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, classificationVariant } from "@/components/ui";

export function DashboardPage() {
  const { user } = useAuth();
  const { data: cases } = useQuery({ queryKey: ["cases"], queryFn: () => api.get<Case[]>("/cases") });
  const { data: audit } = useQuery({ queryKey: ["audit-recent"], queryFn: () => api.get<AuditEvent[]>("/audit?limit=5") });
  const visibleCases = cases ?? [];
  const recentEvents = Array.isArray(audit) ? audit : [];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c06f43]">Operations / {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p><h1 className="font-display text-4xl font-bold tracking-tight text-[#173b3a] md:text-5xl">Good morning, {user?.full_name?.split(" ")[0] || user?.username || "operator"}.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-[#71807a]">Your evidence workspace is clear. Review the latest activity or continue with an authorized case file.</p></div>
        <Link to="/cases"><Button><Plus className="h-4 w-4" /> Open a case file</Button></Link>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={FolderOpen} label="Accessible cases" value={visibleCases.length} note="Within your clearance" /><Metric icon={CheckCircle2} label="Active matters" value={visibleCases.filter((item) => item.status === "ACTIVE").length} note="Currently in progress" tone="green" /><Metric icon={FileCheck2} label="Audit events" value={recentEvents.length} note="Latest 5 shown below" /><Metric icon={LockKeyhole} label="Clearance" value={user?.clearance || "—"} note="Access policy enforced" tone="ink" /></section>
      <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden"><CardHeader className="flex-row items-start justify-between border-b border-[#e6e3da] pb-5"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#9a9b8f]">Authorized records</p><CardTitle className="font-display text-2xl">Your case files</CardTitle></div><Link to="/cases" className="flex items-center gap-1 text-xs font-semibold text-[#c06f43]">View all <ArrowUpRight className="h-3.5 w-3.5" /></Link></CardHeader><CardContent className="p-0">{visibleCases.slice(0, 5).map((item, index) => <CaseRow key={item.id} item={item} index={index} />)}{visibleCases.length === 0 && <div className="p-8 text-sm text-[#71807a]">No cases are visible at your current clearance.</div>}</CardContent></Card>
        <Card><CardHeader className="border-b border-[#e6e3da] pb-5"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#9a9b8f]">Integrity monitor</p><CardTitle className="font-display text-2xl">Activity ledger</CardTitle></CardHeader><CardContent className="pt-5"><div className="mb-6 flex items-center gap-3 rounded-xl bg-[#edf3eb] p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d2e4d0] text-[#3b7954]"><ShieldCheck className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-[#28563b]">Chain integrity nominal</p><p className="text-[11px] text-[#64816c]">SHA-256 verification active</p></div></div><div className="flex flex-col gap-4">{recentEvents.slice(0, 4).map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c06f43]" /><div className="min-w-0"><p className="truncate font-mono text-xs font-medium text-[#25413f]">{event.event_type}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-[#8a958e]"><Clock3 className="h-3 w-3" />{new Date(event.occurred_at).toLocaleString()}</p></div></div>)}</div>{recentEvents.length === 0 && <p className="text-sm text-[#71807a]">No audit activity yet.</p>}<Link to="/audit" className="mt-6 flex items-center gap-1 text-xs font-semibold text-[#c06f43]">Inspect full audit trail <ArrowUpRight className="h-3.5 w-3.5" /></Link></CardContent></Card>
      </section>
      <section className="grid gap-4 md:grid-cols-2"><Link to="/search" className="group rounded-2xl bg-[#173b3a] p-6 text-[#f8f6f0] shadow-[0_12px_28px_rgba(23,59,58,.16)] transition-transform hover:-translate-y-1"><ScanSearch className="mb-8 h-6 w-6 text-[#d9a57c]" /><div className="flex items-end justify-between gap-4"><div><p className="font-display text-2xl font-bold">Search authorized evidence</p><p className="mt-2 text-sm text-[#b9ceca]">Retrieve only what your access policy permits.</p></div><ArrowUpRight className="h-5 w-5" /></div></Link><div className="rounded-2xl border border-[#d9d8ce] bg-[#ebe8de] p-6"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#9a9b8f]">Workspace note</p><p className="font-display text-2xl font-bold text-[#173b3a]">Every action leaves a trace.</p><p className="mt-2 max-w-md text-sm leading-relaxed text-[#71807a]">Pramaan keeps the chain visible so you can work quickly without losing confidence in the record.</p></div></section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, note, tone = "copper" }: { icon: typeof FolderOpen; label: string; value: string | number; note: string; tone?: "copper" | "green" | "ink" }) {
  const colors = { copper: "bg-[#f5e1d5] text-[#a55439]", green: "bg-[#dcebd9] text-[#4e855f]", ink: "bg-[#dbe7e4] text-[#285e59]" };
  return <Card className="p-5"><div className="flex items-start justify-between"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="h-4 w-4" /></span><span className="font-mono text-[10px] text-[#9a9b8f]">LIVE</span></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#71807a]">{label}</p><p className="mt-1 truncate font-display text-3xl font-bold text-[#173b3a]">{value}</p><p className="mt-1 text-[11px] text-[#9a9b8f]">{note}</p></Card>;
}

function CaseRow({ item, index }: { item: Case; index: number }) {
  return <Link to={`/cases/${item.id}`} className="group flex items-center gap-4 border-b border-[#eeeae1] px-6 py-4 last:border-0 hover:bg-[#faf8f2]"><span className="font-mono text-[10px] text-[#b0afa4]">0{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#25413f] group-hover:text-[#c06f43]">{item.title}</span><span className="mt-1 block text-[11px] text-[#9a9b8f]">{item.status} · opened {new Date(item.created_at).toLocaleDateString()}</span></span><Badge variant={classificationVariant(item.classification)}>{item.classification}</Badge><ArrowUpRight className="h-4 w-4 text-[#b0afa4]" /></Link>;
}
