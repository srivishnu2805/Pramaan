import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, FolderPlus, Layers3 } from "lucide-react";
import { api, type Case } from "@/api/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, classificationVariant } from "@/components/ui";

const CLASSIFICATIONS = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"];

export function CasesPage() {
  const qc = useQueryClient();
  const { data: cases, isLoading, error } = useQuery({ queryKey: ["cases"], queryFn: () => api.get<Case[]>("/cases") });
  const [title, setTitle] = React.useState("");
  const [classification, setClassification] = React.useState("CONFIDENTIAL");

  const create = useMutation({
    mutationFn: () => api.post<Case>("/cases", { title, classification }),
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c06f43]">Workspace / Records</p><h1 className="font-display text-4xl font-bold text-[#173b3a]">Case files</h1><p className="mt-2 text-sm text-[#71807a]">A controlled index of the matters and evidence within your clearance.</p></div><div className="flex items-center gap-2 rounded-xl bg-[#e8e6dc] px-3 py-2 text-xs text-[#60716d]"><Layers3 className="h-4 w-4" /> {cases?.length ?? 0} accessible files</div></div>
      <Card className="overflow-hidden border-[#c9d6cf]">
        <CardHeader className="flex-row items-start gap-4 bg-[#edf3eb]"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d2e4d0] text-[#3b7954]"><FolderPlus className="h-5 w-5" /></div><div><CardTitle className="font-display text-2xl">Open a new case</CardTitle><p className="mt-1 text-sm text-[#64816c]">Set the classification before any evidence enters the record.</p></div></CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 md:flex-row md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-title">Case title</Label>
              <Input id="case-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project Northstar" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-classification">Classification</Label>
              <select id="case-classification" value={classification} onChange={(e) => setClassification(e.target.value)} className="h-10 rounded-lg border border-[#c9c8bd] bg-[#fffdf8] px-3 text-sm">
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <Button type="submit" disabled={create.isPending}><FolderPlus className="h-4 w-4" />{create.isPending ? "Opening…" : "Open case"}</Button>
            {create.isError && <span className="text-sm text-[#b34f3d]">{(create.error as Error).message}</span>}
          </form>
        </CardContent>
      </Card>
      {isLoading && <p className="text-sm text-[#71807a]">Loading case index…</p>}
      {error && <p className="rounded-xl bg-[#fff0eb] p-4 text-sm text-[#b34f3d]">{(error as Error).message}</p>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(cases ?? []).map((c) => (
          <Card key={c.id} className="group transition-all hover:-translate-y-1 hover:border-[#b7c9c0] hover:shadow-[0_14px_32px_rgba(43,53,48,.08)]">
            <CardHeader className="flex-row items-start justify-between"><div className="min-w-0"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a9b8f]">Case file</p><CardTitle className="truncate font-display text-2xl"><Link to={`/cases/${c.id}`} className="hover:text-[#c06f43]">{c.title}</Link></CardTitle></div><ArrowUpRight className="h-5 w-5 text-[#b0afa4] transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></CardHeader>
            <CardContent className="flex items-center justify-between gap-2"><div className="flex items-center gap-2">
              <Badge variant={classificationVariant(c.classification)}>{c.classification}</Badge>
              <Badge variant="secondary">{c.status}</Badge>
            </div><span className="text-[11px] text-[#9a9b8f]">{new Date(c.created_at).toLocaleDateString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
