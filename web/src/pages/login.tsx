import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>Pramaan — Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
