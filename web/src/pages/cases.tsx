import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Cases</h1>
      <Card>
        <CardHeader><CardTitle>New case</CardTitle></CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Classification</Label>
              <select value={classification} onChange={(e) => setClassification(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <Button type="submit" disabled={create.isPending}>Create</Button>
            {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
          </form>
        </CardContent>
      </Card>
      {isLoading && <p>Loading…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(cases ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle><Link to={`/cases/${c.id}`} className="underline">{c.title}</Link></CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge variant={classificationVariant(c.classification)}>{c.classification}</Badge>
              <Badge variant="secondary">{c.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
