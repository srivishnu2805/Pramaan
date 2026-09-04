import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type RagResponse } from "@/api/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@/components/ui";
import { ArrowUpRight, LockKeyhole, Search, Sparkles } from "lucide-react";

export function SearchPage() {
  const [query, setQuery] = React.useState("");
  const ask = useMutation({ mutationFn: (q: string) => api.post<RagResponse>("/search/rag", { query: q, top_k: 5 }) });

  return (
    <div className="flex flex-col gap-8">
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c06f43]">Evidence desk / Retrieval</p><h1 className="font-display text-4xl font-bold text-[#173b3a]">Secure search</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71807a]">Ask a question in plain language. Pramaan searches only the records your clearance permits and returns the evidence trail alongside its answer.</p></div>
      <Card className="overflow-hidden border-[#c9d6cf]">
        <CardHeader className="flex-row items-start gap-4 bg-[#173b3a] text-[#f8f6f0]"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d9a57c] text-[#173b3a]"><Search className="h-5 w-5" /></div><div><CardTitle className="font-display text-2xl text-[#f8f6f0]">Ask the evidence</CardTitle><p className="mt-1 text-sm text-[#b9ceca]">Natural language retrieval across your authorized case files.</p></div></CardHeader>
        <CardContent className="bg-[#edf3eb] pt-5">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate(query);
        }}
      >
        <Textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you need to verify? e.g. Which documents mention the Northstar timeline?" rows={3} className="border-[#b7c9c0] bg-[#fffdf8]" />
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="flex items-center gap-2 text-[11px] text-[#64816c]"><LockKeyhole className="h-3.5 w-3.5" /> Authorization scope enforced before retrieval</p><Button type="submit" disabled={ask.isPending} className="w-fit"><Search className="h-4 w-4" />{ask.isPending ? "Searching…" : "Search evidence"}</Button></div>
      </form>
        </CardContent>
      </Card>
      {ask.isError && <p className="text-sm text-red-600">{(ask.error as Error).message}</p>}
      {ask.data && <RagAnswer data={ask.data} />}
    </div>
  );
}

import { Link } from "react-router-dom";

export function RagAnswer({ data }: { data: RagResponse }) {
  const [activeDoc, setActiveDoc] = React.useState<{ id: string; title: string; version: number } | null>(null);
  const [viewerState, setViewerState] = React.useState<{
    loading: boolean;
    error?: string;
    text?: string;
    url?: string;
    isText: boolean;
    isPdf: boolean;
    isImage: boolean;
  }>({ loading: false, isText: false, isPdf: false, isImage: false });

  const openDoc = async (document_id: string, title: string, version_number: number) => {
    setActiveDoc({ id: document_id, title, version: version_number });
    setViewerState({ loading: true, isText: false, isPdf: false, isImage: false });

    try {
      const blob = await api.download(`/documents/${document_id}/versions/${version_number}`);
      const arrayBuffer = await blob.arrayBuffer();
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 32));
      const ext = title.split(".").pop()?.toLowerCase() || "";

      const isPdfHeader = headerBytes.length >= 4 &&
        headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44 && headerBytes[3] === 0x46;

      const isPngHeader = headerBytes.length >= 8 &&
        headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4e && headerBytes[3] === 0x47;

      const isJpgHeader = headerBytes.length >= 3 &&
        headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff;

      const isMp4Header = headerBytes.length >= 12 &&
        headerBytes[4] === 0x66 && headerBytes[5] === 0x74 && headerBytes[6] === 0x79 && headerBytes[7] === 0x70;
      const isWebmHeader = headerBytes.length >= 4 &&
        headerBytes[0] === 0x1a && headerBytes[1] === 0x45 && headerBytes[2] === 0xdf && headerBytes[3] === 0x4a;

      const isPdf = isPdfHeader || ext === "pdf" || blob.type.includes("pdf");
      const isImage = isPngHeader || isJpgHeader || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
      const isVideo = isMp4Header || isWebmHeader || ["mp4", "webm", "ogg", "mov", "m4v"].includes(ext) || blob.type.startsWith("video/");

      if (isPdf) {
        const viewBlob = new Blob([arrayBuffer], { type: "application/pdf" });
        setViewerState({ loading: false, url: URL.createObjectURL(viewBlob), isText: false, isPdf: true, isImage: false, isVideo: false });
      } else if (isImage) {
        const viewBlob = new Blob([arrayBuffer], { type: isJpgHeader ? "image/jpeg" : "image/png" });
        setViewerState({ loading: false, url: URL.createObjectURL(viewBlob), isText: false, isPdf: false, isImage: true, isVideo: false });
      } else if (isVideo) {
        const viewBlob = new Blob([arrayBuffer], { type: isWebmHeader || ext === "webm" ? "video/webm" : "video/mp4" });
        setViewerState({ loading: false, url: URL.createObjectURL(viewBlob), isText: false, isPdf: false, isImage: false, isVideo: true });
      } else {
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(arrayBuffer);
          setViewerState({ loading: false, text, isText: true, isPdf: false, isImage: false, isVideo: false });
        } catch {
          setViewerState({ loading: false, isText: false, isPdf: false, isImage: false, isVideo: false, error: "Binary file cannot be viewed inline." });
        }
      }
    } catch (err) {
      setViewerState({ loading: false, isText: false, isPdf: false, isImage: false, isVideo: false, error: err instanceof Error ? err.message : "Failed to open document" });
    }
  };

  const closeDoc = () => {
    if (viewerState.url) URL.revokeObjectURL(viewerState.url);
    setActiveDoc(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="border-b border-[#e6e3da] pb-5"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5e1d5] text-[#a55439]"><Sparkles className="h-4 w-4" /></span><div><p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a9b8f]">Grounded response</p><CardTitle className="font-display text-2xl">Answer</CardTitle></div></div></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.answer}</p>
          <div className="flex flex-col gap-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-[#25413f]">Evidence trail <Badge variant="secondary">{data.citations.length} sources</Badge></h4>
            {data.citations.map((c, i) => (
              <div key={i} className="rounded-xl border border-[#d9d8ce] bg-[#faf8f2] p-4 text-xs">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#25413f]">{c.document_title || "Document"}</span>
                    <Badge variant="secondary">v{c.version_number}</Badge>
                    {c.page != null && <Badge variant="secondary">p.{c.page}</Badge>}
                    <Badge variant="secondary">chunk {c.chunk_index}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => openDoc(c.document_id, c.document_title || "Document", c.version_number)}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" /> View source
                    </Button>
                    {c.case_id && (
                      <Link to={`/cases/${c.case_id}`}>
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                          Go to Case
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
                <p className="border-l-2 border-[#d9a57c] pl-3 leading-relaxed text-[#49615e]">{c.snippet}</p>
              </div>
            ))}
            {data.citations.length === 0 && (
              <p className="text-xs text-slate-500">No sources — insufficient evidence in scope.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {activeDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{activeDoc.title}</h2>
                <span className="text-xs font-mono text-slate-500">Version {activeDoc.version} • Secure View Only</span>
              </div>
              <Button size="sm" variant="outline" onClick={closeDoc}>✕ Close</Button>
            </div>
            <div className="relative flex-1 overflow-auto bg-slate-100 p-4">
              {viewerState.loading && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-slate-500">Decrypting and loading document…</p>
                </div>
              )}
              {viewerState.error && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-red-600">{viewerState.error}</p>
                </div>
              )}
              {!viewerState.loading && !viewerState.error && viewerState.isText && (
                <div className="h-full rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                  <pre className="h-full overflow-auto font-mono text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                    {viewerState.text}
                  </pre>
                </div>
              )}
              {!viewerState.loading && !viewerState.error && viewerState.isPdf && viewerState.url && (
                <div
                  className="relative h-full w-full"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <iframe
                    src={`${viewerState.url}#toolbar=0&navpanes=0`}
                    className="h-full w-full rounded-md border border-slate-300 bg-white"
                    title="Document Preview"
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </div>
              )}
              {!viewerState.loading && !viewerState.error && viewerState.isImage && viewerState.url && (
                <div
                  className="flex h-full items-center justify-center p-4 select-none"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <img
                    src={viewerState.url}
                    alt="Preview"
                    className="max-h-full max-w-full rounded shadow-sm object-contain select-none"
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                  />
                </div>
              )}
              {!viewerState.loading && !viewerState.error && viewerState.isVideo && viewerState.url && (
                <div
                  className="flex h-full items-center justify-center p-4 bg-black rounded-md select-none"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <video
                    src={viewerState.url}
                    controls
                    controlsList="nodownload"
                    disablePictureInPicture
                    className="max-h-full max-w-full rounded shadow-sm"
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
