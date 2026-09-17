"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setError(payload.error ?? "Login failed.");
      setBusy(false);
      return;
    }
    const returnTo = searchParams.get("returnTo");
    window.location.href = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/admin";
  }

  return (
    <main className="admin-page admin-login-page">
      <div className="admin-brand"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co"/><span>CATALOGUE CONTROL</span></div>
      <form className="admin-login-card" onSubmit={submit}>
        <p className="eyebrow">SECURE ADMIN</p>
        <h1>Sign in</h1>
        <p>Enter the catalogue admin password.</p>
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        {error ? <p className="admin-login-error">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return <Suspense fallback={<main className="admin-page" />}><LoginForm /></Suspense>;
}
