import { useQuery } from "@tanstack/react-query";
import { api, type AuditEvent } from "@/api/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export function AuditPage() {
  const { data: events, refetch, isFetching } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEvent[]>("/audit?limit=100"),
  });
  const { data: verification, refetch: reverify, isFetching: verifying } = useQuery({
    queryKey: ["audit-verify"],
    queryFn: () => api.get<{ valid: boolean; broken: string[] }>("/audit/verify"),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        Audit Trail
        {verification && (
          <Badge variant={verification.valid ? "success" : "destructive"}>
            {verification.valid ? "chain intact" : `BROKEN (${verification.broken.length})`}
          </Badge>
        )}
      </h1>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { refetch(); reverify(); }} disabled={isFetching || verifying}>
          Refresh
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Events (newest first)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Object</th>
                <th className="py-2">Hash</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.occurred_at).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono">{e.event_type}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{e.object_ref?.slice(0, 18) ?? "—"}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">{e.event_hash.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(events ?? []).length === 0 && <p className="text-sm text-slate-500">No events yet.</p>}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        Tamper-evident hash chain (SHA-256). Verification recomputes every link; any rewritten event breaks the
        chain. The chain is tamper-evident, not immutable — production anchors checkpoints to append-only storage.
      </p>
    </div>
  );
}
