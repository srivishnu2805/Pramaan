import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth";
import { Layout } from "@/components/layout";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { CasesPage } from "@/pages/cases";
import { CaseDetailPage } from "@/pages/case-detail";
import { SearchPage } from "@/pages/search";
import { AssistantPage } from "@/pages/assistant";
import { AuditPage } from "@/pages/audit";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Guard><DashboardPage /></Guard>} />
            <Route path="/cases" element={<Guard><CasesPage /></Guard>} />
            <Route path="/cases/:id" element={<Guard><CaseDetailPage /></Guard>} />
            <Route path="/search" element={<Guard><SearchPage /></Guard>} />
            <Route path="/assistant" element={<Guard><AssistantPage /></Guard>} />
            <Route path="/audit" element={<Guard><AuditPage /></Guard>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
