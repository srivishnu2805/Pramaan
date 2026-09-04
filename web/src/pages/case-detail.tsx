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
          <div className="flex flex-col gap-1.5">
            <Label>File</Label>
            <Input
              type="file"
              accept=".pdf,.txt,.md,.json,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
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
          {(versions ?? []).map((v) => <VersionRow key={v.version_number} doc={doc} v={v} />)}
          <form onSubmit={addVersion} className="flex items-end gap-2">
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button size="sm" type="submit">New version</Button>
          </form>
        </div>
      )}
    </li>
  );
}

interface ViewerState {
  open: boolean;
  docTitle: string;
  versionNumber: number;
  loading: boolean;
  error?: string;
  url?: string;
  text?: string;
  isText: boolean;
  isPdf: boolean;
  isImage: boolean;
  isVideo: boolean;
  mediaType: string;
}

function VersionRow({ doc, v }: { doc: Document; v: DocVersion }) {
  const { data: integrity, refetch, isFetching } = useQuery({
    queryKey: ["integrity", doc.id, v.version_number],
    queryFn: () => api.get<Integrity>(`/documents/${doc.id}/versions/${v.version_number}/verify`),
    enabled: false,
  });

  const [viewer, setViewer] = React.useState<ViewerState>({
    open: false,
    docTitle: doc.title,
    versionNumber: v.version_number,
    loading: false,
    isText: false,
    isPdf: false,
    isImage: false,
    isVideo: false,
    mediaType: "",
  });

  const closeViewer = () => {
    if (viewer.url) {
      URL.revokeObjectURL(viewer.url);
    }
    setViewer((prev) => ({ ...prev, open: false, url: undefined, text: undefined }));
  };

  const openViewer = async () => {
    setViewer({
      open: true,
      docTitle: doc.title,
      versionNumber: v.version_number,
      loading: true,
      isText: false,
      isPdf: false,
      isImage: false,
      isVideo: false,
      mediaType: "",
    });

    try {
      const blob = await api.download(`/documents/${doc.id}/versions/${v.version_number}`);
      const arrayBuffer = await blob.arrayBuffer();
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 32));
      const ext = doc.title.split(".").pop()?.toLowerCase() || "";

      // Magic bytes checking
      const isPdfHeader = headerBytes.length >= 4 &&
        headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44 && headerBytes[3] === 0x46; // %PDF

      const isPngHeader = headerBytes.length >= 8 &&
        headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4e && headerBytes[3] === 0x47; // \x89PNG

      const isJpgHeader = headerBytes.length >= 3 &&
        headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff; // JPEG

      const isGifHeader = headerBytes.length >= 6 &&
        headerBytes[0] === 0x47 && headerBytes[1] === 0x49 && headerBytes[2] === 0x46; // GIF

      const isMp4Header = headerBytes.length >= 12 &&
        headerBytes[4] === 0x66 && headerBytes[5] === 0x74 && headerBytes[6] === 0x79 && headerBytes[7] === 0x70; // ftyp

      const isWebmHeader = headerBytes.length >= 4 &&
        headerBytes[0] === 0x1a && headerBytes[1] === 0x45 && headerBytes[2] === 0xdf && headerBytes[3] === 0xa3;

      const isPdf = isPdfHeader || ext === "pdf" || blob.type.includes("pdf");
      const isImage = isPngHeader || isJpgHeader || isGifHeader ||
        ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) || blob.type.startsWith("image/");
      const isVideo = isMp4Header || isWebmHeader ||
        ["mp4", "webm", "ogg", "mov", "m4v"].includes(ext) || blob.type.startsWith("video/");

      if (isPdf) {
        const pdfBlob = new Blob([arrayBuffer], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(pdfBlob);
        setViewer({
          open: true,
          docTitle: doc.title,
          versionNumber: v.version_number,
          loading: false,
          url: objectUrl,
          isText: false,
          isPdf: true,
          isImage: false,
          isVideo: false,
          mediaType: "application/pdf",
        });
      } else if (isImage) {
        let imageType = "image/png";
        if (isJpgHeader || ext === "jpg" || ext === "jpeg") imageType = "image/jpeg";
        else if (isGifHeader || ext === "gif") imageType = "image/gif";
        else if (ext === "webp") imageType = "image/webp";
        else if (ext === "svg") imageType = "image/svg+xml";

        const imgBlob = new Blob([arrayBuffer], { type: imageType });
        const objectUrl = URL.createObjectURL(imgBlob);
        setViewer({
          open: true,
          docTitle: doc.title,
          versionNumber: v.version_number,
          loading: false,
          url: objectUrl,
          isText: false,
          isPdf: false,
          isImage: true,
          isVideo: false,
          mediaType: imageType,
        });
      } else if (isVideo) {
        let videoType = "video/mp4";
        if (isWebmHeader || ext === "webm") videoType = "video/webm";
        else if (ext === "ogg") videoType = "video/ogg";

        const vidBlob = new Blob([arrayBuffer], { type: videoType });
        const objectUrl = URL.createObjectURL(vidBlob);
        setViewer({
          open: true,
          docTitle: doc.title,
          versionNumber: v.version_number,
          loading: false,
          url: objectUrl,
          isText: false,
          isPdf: false,
          isImage: false,
          isVideo: true,
          mediaType: videoType,
        });
      } else {
        // Try decoding as text (check if UTF-8 readable or matches text extensions)
        let looksLikeText = false;
        let textContent = "";
        try {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          // Test sample
          textContent = decoder.decode(arrayBuffer);
          looksLikeText = true;
        } catch {
          looksLikeText = false;
        }

        const textExts = ["txt", "md", "json", "csv", "log", "py", "js", "ts", "html", "xml", "yaml", "yml"];
        if (looksLikeText || textExts.includes(ext) || blob.type.startsWith("text/")) {
          setViewer({
            open: true,
            docTitle: doc.title,
            versionNumber: v.version_number,
            loading: false,
            text: textContent,
            isText: true,
            isPdf: false,
            isImage: false,
            mediaType: "text/plain",
          });
        } else {
          setViewer({
            open: true,
            docTitle: doc.title,
            versionNumber: v.version_number,
            loading: false,
            isText: false,
            isPdf: false,
            isImage: false,
            mediaType: "application/octet-stream",
          });
        }
      }
    } catch (err) {
      setViewer({
        open: true,
        docTitle: doc.title,
        versionNumber: v.version_number,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load document preview",
        isText: false,
        isPdf: false,
        isImage: false,
        mediaType: "",
      });
    }
  };

  const download = async () => {
    const blob = await api.download(`/documents/${doc.id}/versions/${v.version_number}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.title || `version-${v.version_number}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 px-3 py-2 text-sm">
        <span className="font-mono">v{v.version_number}</span>
        <span className="font-mono text-xs text-slate-500">{v.content_hash.slice(0, 16)}…</span>
        {integrity && (
          <Badge variant={integrity.valid ? "success" : "destructive"}>
            {integrity.valid ? "verified" : "FAILED"}
          </Badge>
        )}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="default" onClick={openViewer}>View</Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Verify</Button>
        </span>
      </div>

      {viewer.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{viewer.docTitle}</h2>
                <span className="text-xs font-mono text-slate-500">Version {viewer.versionNumber} • Secure View Only</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={closeViewer}>✕ Close</Button>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto bg-slate-100 p-4">
              {viewer.loading && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-slate-500">Decrypting and loading document…</p>
                </div>
              )}

              {viewer.error && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-red-600">{viewer.error}</p>
                </div>
              )}

              {!viewer.loading && !viewer.error && viewer.isText && (
                <div className="h-full rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                  <pre className="h-full overflow-auto font-mono text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                    {viewer.text}
                  </pre>
                </div>
              )}

              {!viewer.loading && !viewer.error && viewer.isPdf && viewer.url && (
                <div
                  className="relative h-full w-full"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <iframe
                    src={`${viewer.url}#toolbar=0&navpanes=0`}
                    className="h-full w-full rounded-md border border-slate-300 bg-white"
                    title="Document Preview"
                  />
                  {/* Transparent overlay over edge toolbars to intercept right click */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </div>
              )}

              {!viewer.loading && !viewer.error && viewer.isImage && viewer.url && (
                <div
                  className="flex h-full items-center justify-center p-4 select-none"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <img
                    src={viewer.url}
                    alt="Evidence preview"
                    className="max-h-full max-w-full rounded shadow-sm object-contain pointer-events-auto select-none"
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                  />
                </div>
              )}

              {!viewer.loading && !viewer.error && viewer.isVideo && viewer.url && (
                <div
                  className="flex h-full items-center justify-center p-4 bg-black rounded-md select-none"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <video
                    src={viewer.url}
                    controls
                    controlsList="nodownload"
                    disablePictureInPicture
                    className="max-h-full max-w-full rounded shadow-sm"
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>
              )}

              {!viewer.loading && !viewer.error && !viewer.isText && !viewer.isPdf && !viewer.isImage && !viewer.isVideo && (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <p className="text-sm text-slate-600">This file type cannot be rendered inline in the browser.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PermissionsSection({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data: perms } = useQuery({ queryKey: ["perms", caseId], queryFn: () => api.get<Permission[]>(`/cases/${caseId}/permissions`) });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.get<import("@/api/client").User[]>("/auth/users") });
  const [userId, setUserId] = React.useState("");
  const [level, setLevel] = React.useState("VIEW");
  const [error, setError] = React.useState<string | null>(null);

  // Pre-select first user when list loads
  React.useEffect(() => {
    if (users?.length && !userId) setUserId(users[0].id);
  }, [users, userId]);

  const usernameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users ?? []) map[u.id] = u.username;
    return map;
  }, [users]);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/cases/${caseId}/permissions`, { user_id: userId, level });
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
          <div className="flex flex-col gap-1.5">
            <Label>User</Label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
              required
            >
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}{u.full_name ? ` — ${u.full_name}` : ""}
                </option>
              ))}
            </select>
          </div>
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
              <span className="font-medium">{usernameById[p.user_id] ?? p.user_id.slice(0, 8) + "…"}</span>
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
