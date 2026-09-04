import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type RagResponse } from "@/api/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@/components/ui";

export function SearchPage() {
  const [query, setQuery] = React.useState("");
  const ask = useMutation({ mutationFn: (q: string) => api.post<RagResponse>("/search/rag", { query: q, top_k: 5 }) });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Secure Semantic Search</h1>
      <p className="text-sm text-slate-600">
        Retrieval is authorization-constrained <em>before</em> vector search: only cases you can access are ever queried.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate(query);
        }}
      >
        <Textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about your authorized cases…" rows={3} />
        <Button type="submit" disabled={ask.isPending} className="w-fit">
          {ask.isPending ? "Searching…" : "Search"}
        </Button>
      </form>
      {ask.isError && <p className="text-sm text-red-600">{(ask.error as Error).message}</p>}
      {ask.data && <RagAnswer data={ask.data} />}
    </div>
  );
}

export function RagAnswer({ data }: { data: RagResponse }) {
  return (
    <Card>
      <CardHeader><CardTitle>Answer</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-sm">{data.answer}</p>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Citations ({data.citations.length})</h4>
          {data.citations.map((c, i) => (
            <div key={i} className="rounded-md bg-slate-50 p-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline">doc {c.document_id.slice(0, 8)}…</Badge>
                <Badge variant="secondary">v{c.version_number}</Badge>
                {c.page != null && <Badge variant="secondary">p.{c.page}</Badge>}
                <Badge variant="secondary">chunk {c.chunk_index}</Badge>
              </div>
              <p className="text-slate-700">{c.snippet}</p>
            </div>
          ))}
          {data.citations.length === 0 && <p className="text-xs text-slate-500">No sources — insufficient evidence in scope.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
