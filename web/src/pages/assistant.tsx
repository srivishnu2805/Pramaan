import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BotOff } from "lucide-react";
import { api, type RagResponse } from "@/api/client";
import { Button, Card, CardContent, Textarea } from "@/components/ui";
import { RagAnswer } from "@/pages/search";

interface Msg {
  role: "user" | "assistant";
  text?: string;
  rag?: RagResponse;
}

export function AssistantPage() {
  const { data: config } = useQuery<{ allow_external_ai: boolean }>({
    queryKey: ["app-config"],
    queryFn: () => api.get<{ allow_external_ai: boolean }>("/config"),
  });

  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState("");
  const ask = useMutation({
    mutationFn: (q: string) => api.post<RagResponse>("/search/rag", { query: q, top_k: 5 }),
    onSuccess: (rag, q) => setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", rag }]),
  });

  if (config && !config.allow_external_ai) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <BotOff className="h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-bold text-slate-800">AI Assistant Disabled</h2>
        <p className="max-w-md text-sm text-slate-600">
          External AI integration is currently disabled (<code>PRAMAAN_ALLOW_EXTERNAL_AI=false</code>) to safeguard confidential records from third-party APIs.
        </p>
        <Link to="/search">
          <Button variant="default">Use Secure Search</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">AI Assistant</h1>
      <p className="text-sm text-slate-600">
        Answers are grounded only in cases you are authorized to access, with citations. Retrieved content is
        treated as untrusted data, never instructions.
      </p>
      <div className="flex flex-col gap-3">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <Card key={i} className="self-end bg-slate-900 text-white">
              <CardContent className="p-3 text-sm">{m.text}</CardContent>
            </Card>
          ) : (
            <div key={i} className="self-start w-full max-w-3xl">
              {m.rag && <RagAnswer data={m.rag} />}
            </div>
          ),
        )}
        {msgs.length === 0 && <p className="text-sm text-slate-500">Ask your first question below.</p>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) {
            ask.mutate(draft.trim());
            setDraft("");
          }
        }}
      >
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask…" rows={2} className="flex-1" />
        <Button type="submit" disabled={ask.isPending}>Send</Button>
      </form>
      {ask.isError && <p className="text-sm text-red-600">{(ask.error as Error).message}</p>}
    </div>
  );
}
