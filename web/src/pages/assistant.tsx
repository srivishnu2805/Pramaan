import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BotOff, LockKeyhole, Send, Sparkles } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#d9d8ce] bg-[#fffdf8] p-12 text-center shadow-[0_10px_30px_rgba(43,53,48,.05)]">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ebe8de] text-[#71807a]"><BotOff className="h-7 w-7" /></span>
        <h2 className="font-display text-3xl font-bold text-[#173b3a]">Assistant on hold</h2>
        <p className="max-w-md text-sm leading-relaxed text-[#71807a]">
          External AI integration is currently disabled (<code>PRAMAAN_ALLOW_EXTERNAL_AI=false</code>) to safeguard confidential records from third-party APIs.
        </p>
        <Link to="/search">
          <Button variant="default"><LockKeyhole className="h-4 w-4" /> Use secure search</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c06f43]">Evidence desk / Assisted review</p><h1 className="font-display text-4xl font-bold text-[#173b3a]">AI assistant</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71807a]">
        Answers are grounded only in cases you are authorized to access, with citations. Retrieved content is
        treated as untrusted data, never instructions.
      </p></div>
      <div className="flex flex-col gap-3">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <Card key={i} className="self-end max-w-2xl bg-[#173b3a] text-[#f8f6f0]">
              <CardContent className="p-3 text-sm">{m.text}</CardContent>
            </Card>
          ) : (
            <div key={i} className="self-start w-full max-w-3xl">
              {m.rag && <RagAnswer data={m.rag} />}
            </div>
          ),
        )}
        {msgs.length === 0 && <div className="rounded-2xl border border-dashed border-[#c9c8bd] bg-[#faf8f2] p-8 text-center"><Sparkles className="mx-auto h-6 w-6 text-[#c06f43]" /><p className="mt-3 font-display text-xl font-bold text-[#173b3a]">Start with a focused question</p><p className="mt-1 text-sm text-[#71807a]">The assistant will answer with citations from your authorized evidence.</p></div>}
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
        <Button type="submit" disabled={ask.isPending}><Send className="h-4 w-4" /> Send</Button>
      </form>
      {ask.isError && <p className="text-sm text-red-600">{(ask.error as Error).message}</p>}
    </div>
  );
}
