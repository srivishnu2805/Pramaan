import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

const COUNTDOWN = 5;

export function UnauthorizedPage() {
  const nav = useNavigate();
  const [secs, setSecs] = React.useState(COUNTDOWN);

  const calledRef = React.useRef(false);

  // Log session expiry to the audit trail (fire-and-forget, best effort, once)
  React.useEffect(() => {
    if (!calledRef.current) {
      calledRef.current = true;
      fetch("/auth/session-expired", { method: "POST" }).catch(() => {});
    }
  }, []);

  // Countdown then redirect to login
  React.useEffect(() => {
    if (secs <= 0) {
      nav("/login", { replace: true });
      return;
    }
    const id = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secs, nav]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 text-slate-900">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-white px-12 py-10 shadow-sm">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <h1 className="text-2xl font-bold">Session Expired</h1>
        <p className="max-w-xs text-center text-sm text-slate-500">
          Your session is no longer valid. This access attempt has been recorded in the audit trail.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-4xl font-mono font-bold text-red-500">{secs}</span>
          <span className="text-sm text-slate-500">seconds until redirect…</span>
        </div>
        <button
          onClick={() => nav("/login", { replace: true })}
          className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Go to Login now
        </button>
      </div>
    </div>
  );
}