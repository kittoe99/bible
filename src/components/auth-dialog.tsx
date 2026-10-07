"use client";
import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Dialog from "./dialog";
export default function AuthDialog({
  client,
  onClose,
  recovery = false,
}: {
  client: SupabaseClient | null;
  onClose: () => void;
  recovery?: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "update">(
    recovery ? "update" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const redirect = `${location.origin}/auth/callback`;
      const result =
        mode === "signup"
          ? await client.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: redirect },
            })
          : mode === "reset"
            ? await client.auth.resetPasswordForEmail(email, {
                redirectTo: `${redirect}?recovery=1`,
              })
            : mode === "update"
              ? await client.auth.updateUser({ password })
              : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === "signin" || mode === "update") {
        onClose();
        history.replaceState({}, "", location.pathname);
      } else
        setMessage(
          mode === "signup"
            ? "Check your email to confirm your account, then sign in."
            : "If an account exists, a password reset link is on its way.",
        );
    } catch (e) {
      setError(true);
      setMessage(
        e instanceof Error ? e.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={mode === "update" ? "Choose a new password" : "Account"}
      onClose={onClose}
    >
      {!client ? (
        <div className="notice">
          <strong>Cloud saving is not connected yet</strong>
          <p>
            Complete the Supabase setup to enable accounts and private cloud
            storage.
          </p>
          <a href="/setup">
            View setup guide <ArrowRight size={14} />
          </a>
        </div>
      ) : (
        <>
          <div className="auth-tabs">
            {(["signin", "signup"] as const).map((tab) => (
              <button
                key={tab}
                className={mode === tab ? "active" : ""}
                onClick={() => {
                  setMode(tab);
                  setMessage("");
                }}
              >
                {tab === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode !== "update" && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </label>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "reset"
                  ? "Send reset link"
                  : mode === "update"
                    ? "Update password"
                    : mode === "signup"
                      ? "Create your account"
                      : "Sign in"}
              <ArrowRight size={16} />
            </button>
            {mode === "signin" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode("reset");
                  setMessage("");
                }}
              >
                Forgot your password?
              </button>
            )}
            {message && (
              <p
                role="status"
                className={error ? "form-error" : "form-success"}
              >
                <Mail size={16} />
                {message}
              </p>
            )}
          </form>
        </>
      )}
    </Dialog>
  );
}
