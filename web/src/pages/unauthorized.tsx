import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f1e9] px-5 text-[#172321]">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-[#e5cfc4] bg-[#fffdf8] px-8 py-10 text-center shadow-[0_16px_40px_rgba(43,53,48,.08)]">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0eb] text-[#b34f3d]"><ShieldAlert className="h-7 w-7" /></span>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#b34f3d]">Access event recorded</p><h1 className="font-display text-3xl font-bold text-[#173b3a]">Session expired</h1>
        <p className="max-w-xs text-center text-sm leading-relaxed text-[#71807a]">
          Your session is no longer valid. This access attempt has been recorded in the audit trail.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-4xl font-mono font-bold text-[#b34f3d]">{secs}</span>
          <span className="text-sm text-[#71807a]">seconds until redirect</span>
        </div>
        <button
          type="button"
          onClick={() => nav("/login", { replace: true })}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#173b3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#245654]"
        >
          Return to sign in <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}