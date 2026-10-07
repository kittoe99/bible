"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthMode = "signin" | "signup" | "reset" | "update";

function friendlyError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "invalid_credentials")
    return "The email or password is incorrect. Please try again.";
  if (code === "email_not_confirmed")
    return "Confirm your email before signing in. You can resend the confirmation below.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  )
    return "Too many attempts. Please wait a minute and try again.";
  if (code === "weak_password")
    return "Choose a stronger password with at least 8 characters.";
  if (error instanceof TypeError)
    return "We couldn’t connect. Check your internet connection and try again.";
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function AuthForm({
  client,
  initialMode = "signin",
  onComplete,
}: {
  client: SupabaseClient | null;
  initialMode?: AuthMode;
  onComplete: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [recoveryReady, setRecoveryReady] = useState(initialMode !== "update");
  const requestPending = useRef(false);

  useEffect(() => {
    if (initialMode !== "update" || !client) return;
    let cancelled = false;
    void client.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data.user) {
          setError(true);
          setMessage(
            "This reset link has expired or is invalid. Request a new password reset link.",
          );
        } else setRecoveryReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setMessage(
            "We couldn’t verify your reset link. Request a new link and try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, initialMode]);

  useEffect(() => {
    if (!resendAfter) return;
    const timer = setTimeout(() => setResendAfter(resendAfter - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendAfter]);

  function switchMode(next: AuthMode) {
    if (requestPending.current) return;
    setMode(next);
    setMessage("");
    setError(false);
    setPassword("");
    setConfirmation("");
    setVisible(false);
    setCanResend(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !client ||
      requestPending.current ||
      (mode === "update" && !recoveryReady)
    )
      return;
    if ((mode === "signup" || mode === "update") && password !== confirmation) {
      setError(true);
      setMessage("Your passwords don’t match.");
      return;
    }
    requestPending.current = true;
    setBusy(true);
    setMessage("");
    setError(false);
    setCanResend(false);
    try {
      const redirect = `${location.origin}/auth/callback`;
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onComplete();
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirect },
        });
        if (error) throw error;
        if (data.session) {
          onComplete();
          return;
        }
        setPassword("");
        setConfirmation("");
        setCanResend(true);
        setResendAfter(60);
        setMessage("Check your email to confirm your account, then sign in.");
      } else if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${redirect}?recovery=1` },
        );
        if (error) throw error;
        setMessage(
          "If an account exists, a password reset link is on its way.",
        );
      } else {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        onComplete();
      }
    } catch (error) {
      setError(true);
      setMessage(friendlyError(error));
      if ((error as { code?: string })?.code === "email_not_confirmed")
        setCanResend(true);
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (!client || requestPending.current || resendAfter) return;
    requestPending.current = true;
    setBusy(true);
    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
      setError(false);
      setMessage("Check your email for a new confirmation link.");
      setResendAfter(60);
    } catch (error) {
      setError(true);
      setMessage(friendlyError(error));
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  const title =
    mode === "signin"
      ? "Welcome back."
      : mode === "signup"
        ? "A place for your notes."
        : mode === "reset"
          ? "Forgot your password?"
          : "Choose a new password";
  return (
    <div className="auth-content">
      <div className="auth-symbol" aria-hidden="true">
        <BookOpen size={26} strokeWidth={1.5} />
      </div>
      <div className="auth-intro">
        <h2>{title}</h2>
        <p>
          {mode === "signin"
            ? "Pick up where you left off."
            : mode === "signup"
              ? "Keep your study with you, on every device."
              : mode === "reset"
                ? "We’ll email you a link to get back in."
                : "A fresh start for your account."}
        </p>
      </div>
      {!client ? (
        <div className="notice">
          <strong>Sign-in is being set up</strong>
          <p>
            Reading is available. Account access needs the Supabase environment
            variables.
          </p>
          <a href="/setup">
            View setup guide <ArrowRight size={14} />
          </a>
        </div>
      ) : (
        <>
          {(mode === "signin" || mode === "signup") && (
            <div className="auth-tabs" aria-label="Account options">
              <button
                type="button"
                disabled={busy}
                aria-pressed={mode === "signin"}
                className={mode === "signin" ? "active" : ""}
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={mode === "signup"}
                className={mode === "signup" ? "active" : ""}
                onClick={() => switchMode("signup")}
              >
                Create account
              </button>
            </div>
          )}
          <form onSubmit={submit} className="auth-form" aria-busy={busy}>
            <fieldset disabled={busy}>
              {mode !== "update" && (
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
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
                  <span className="password-field">
                    <input
                      type={visible ? "text" : "password"}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      minLength={mode === "signin" ? undefined : 8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === "signin"
                          ? "Your password"
                          : "At least 8 characters"
                      }
                      required
                    />
                    <button
                      type="button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
              )}
              {(mode === "signup" || mode === "update") && (
                <label>
                  Confirm password
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="Enter your password again"
                    required
                  />
                </label>
              )}
              {mode === "signin" && (
                <button
                  type="button"
                  className="auth-forgot"
                  onClick={() => switchMode("reset")}
                >
                  Forgot your password?
                </button>
              )}
              <button
                className="button primary auth-submit"
                disabled={busy || (mode === "update" && !recoveryReady)}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="auth-spinner" />
                    Please wait…
                  </>
                ) : (
                  <>
                    {mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create your account"
                        : mode === "reset"
                          ? "Send reset link"
                          : "Update password"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </fieldset>
            {message && (
              <p
                role={error ? "alert" : "status"}
                className={
                  error
                    ? "form-error auth-feedback"
                    : "form-success auth-feedback"
                }
              >
                {error ? <Mail size={18} /> : <Check size={18} />}
                <span>{message}</span>
              </p>
            )}
            {canResend && (
              <button
                type="button"
                className="text-button auth-resend"
                disabled={busy || resendAfter > 0}
                onClick={() => void resend()}
              >
                {resendAfter
                  ? `Resend in ${resendAfter}s`
                  : "Resend confirmation email"}
              </button>
            )}
            {(mode === "reset" || mode === "update") && (
              <button
                type="button"
                className="text-button auth-back"
                disabled={busy}
                onClick={() =>
                  switchMode(
                    mode === "update" && !recoveryReady ? "reset" : "signin",
                  )
                }
              >
                <ArrowLeft size={14} />
                {mode === "update" && !recoveryReady
                  ? "Request a new reset link"
                  : "Back to sign in"}
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}
