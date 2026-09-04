import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Case } from "@/api/client";
import { Badge, Card, CardContent, CardHeader, CardTitle, classificationVariant } from "@/components/ui";

export function DashboardPage() {
  const { data: cases } = useQuery({ queryKey: ["cases"], queryFn: () => api.get<Case[]>("/cases") });
  const { data: audit } = useQuery({ queryKey: ["audit-recent"], queryFn: () => api.get("/audit?limit=5") });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Accessible cases ({cases?.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {(cases ?? []).slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <Link to={`/cases/${c.id}`} className="underline">{c.title}</Link>
                  <Badge variant={classificationVariant(c.classification)}>{c.classification}</Badge>
                </li>
              ))}
              {(cases ?? []).length === 0 && <li className="text-sm text-slate-500">No cases visible.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent audit events</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {(Array.isArray(audit) ? audit : []).map((e: { id: string; event_type: string; occurred_at: string }) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="font-mono">{e.event_type}</span>
                  <span className="text-slate-500">{new Date(e.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <Link to="/audit" className="mt-3 inline-block text-sm underline">View full audit trail</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
