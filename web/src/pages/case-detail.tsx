import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, type Case, type Document, type DocVersion, type Integrity, type Permission } from "@/api/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, classificationVariant } from "@/components/ui";

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: case_ } = useQuery({ queryKey: ["case", id], queryFn: () => api.get<Case>(`/cases/${id}`) });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        {case_?.title ?? "Case"}
        {case_ && <Badge variant={classificationVariant(case_.classification)}>{case_?.classification}</Badge>}
      </h1>
      {id && <DocumentsSection caseId={id} />}
      {id && <PermissionsSection caseId={id} />}
    </div>
  );
}

function DocumentsSection({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data: docs } = useQuery({ queryKey: ["docs", caseId], queryFn: () => api.get<Document[]>(`/cases/${caseId}/documents`) });
  const [title, setTitle] = React.useState("");
  const [classification, setClassification] = React.useState("CONFIDENTIAL");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.append("title", title);
    form.append("classification", classification);
    form.append("file", file);
    try {
      await api.upload(`/cases/${caseId}/documents`, form);
      setTitle("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["docs", caseId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Classification</Label>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
              {["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><Label>File</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></div>
          <Button type="submit">Upload</Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </form>
        <ul className="flex flex-col gap-3">
          {(docs ?? []).map((d) => <DocumentRow key={d.id} doc={d} />)}
          {(docs ?? []).length === 0 && <li className="text-sm text-slate-500">No documents.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc }: { doc: Document }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: versions } = useQuery({
    queryKey: ["versions", doc.id],
    queryFn: () => api.get<DocVersion[]>(`/documents/${doc.id}/versions`),
    enabled: open,
  });
  const [file, setFile] = React.useState<File | null>(null);

  const addVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await api.upload(`/documents/${doc.id}/versions`, form);
    setFile(null);
    qc.invalidateQueries({ queryKey: ["versions", doc.id] });
  };

  const setStatus = async (status: string) => {
    await api.patch(`/documents/${doc.id}/status`, { status });
    qc.invalidateQueries({ queryKey: ["docs", doc.case_id] });
  };

  return (
    <li className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="font-medium underline" onClick={() => setOpen((v) => !v)}>{doc.title}</button>
        <Badge variant={classificationVariant(doc.classification)}>{doc.classification}</Badge>
        <Badge variant={doc.status === "ACTIVE" ? "success" : "warning"}>{doc.status}</Badge>
        <span className="text-xs text-slate-500">v{doc.version_count}</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setStatus("ARCHIVED")}>Archive</Button>
          <Button size="sm" variant="outline" onClick={() => setStatus("ACTIVE")}>Restore</Button>
        </span>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {(versions ?? []).map((v) => <VersionRow key={v.version_number} docId={doc.id} v={v} />)}
          <form onSubmit={addVersion} className="flex items-end gap-2">
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button size="sm" type="submit">New version</Button>
          </form>
        </div>
      )}
    </li>
  );
}

function VersionRow({ docId, v }: { docId: string; v: DocVersion }) {
  const { data: integrity, refetch, isFetching } = useQuery({
    queryKey: ["integrity", docId, v.version_number],
    queryFn: () => api.get<Integrity>(`/documents/${docId}/versions/${v.version_number}/verify`),
    enabled: false,
  });

  const download = async () => {
    const blob = await api.download(`/documents/${docId}/versions/${v.version_number}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `version-${v.version_number}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 px-3 py-2 text-sm">
      <span className="font-mono">v{v.version_number}</span>
      <span className="font-mono text-xs text-slate-500">{v.content_hash.slice(0, 16)}…</span>
      {integrity && (
        <Badge variant={integrity.valid ? "success" : "destructive"}>
          {integrity.valid ? "verified" : "FAILED"}
        </Badge>
      )}
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Verify</Button>
        <Button size="sm" variant="outline" onClick={download}>Download</Button>
      </span>
    </div>
  );
}

function PermissionsSection({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data: perms } = useQuery({ queryKey: ["perms", caseId], queryFn: () => api.get<Permission[]>(`/cases/${caseId}/permissions`) });
  const [userId, setUserId] = React.useState("");
  const [level, setLevel] = React.useState("VIEW");
  const [error, setError] = React.useState<string | null>(null);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/cases/${caseId}/permissions`, { user_id: userId, level });
      setUserId("");
      qc.invalidateQueries({ queryKey: ["perms", caseId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant failed");
    }
  };

  const revoke = async (target: string) => {
    await api.delete(`/cases/${caseId}/permissions/${target}`);
    qc.invalidateQueries({ queryKey: ["perms", caseId] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Permissions</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={grant} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5"><Label>User ID (UUID)</Label><Input value={userId} onChange={(e) => setUserId(e.target.value)} required className="w-80 font-mono" /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Level</Label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
              {["VIEW", "EDIT", "MANAGE"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <Button type="submit">Grant</Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </form>
        <ul className="flex flex-col gap-2 text-sm">
          {(perms ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="font-mono">{p.user_id.slice(0, 8)}…</span>
              <Badge variant="secondary">{p.level}</Badge>
              <Button size="sm" variant="ghost" onClick={() => revoke(p.user_id)}>Revoke</Button>
            </li>
          ))}
          {(perms ?? []).length === 0 && <li className="text-slate-500">No explicit grants (owner + admins have access).</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
