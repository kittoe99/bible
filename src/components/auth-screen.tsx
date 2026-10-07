"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import AuthForm, { type AuthMode } from "./auth-form";
import { getSupabase } from "@/lib/supabase";

export default function AuthScreen({
  mode = "signin",
  linkError = false,
}: {
  mode?: AuthMode;
  linkError?: boolean;
}) {
  const [client] = useState(getSupabase);
  const router = useRouter();
  return (
    <main className="auth-page">
      <header className="auth-page-header">
        <Link href="/" className="auth-brand">
          <BookOpen size={24} strokeWidth={1.5} />
          Bible
        </Link>
        <Link href="/" className="auth-reading-link">
          <ArrowLeft size={15} />
          Back to reading
        </Link>
      </header>
      <section className="auth-page-card" aria-label="Your Bible account">
        {linkError && (
          <p role="alert" className="form-error auth-feedback">
            That email link has expired or could not be verified. Sign in or
            request a new link.
          </p>
        )}
        <AuthForm
          client={client}
          initialMode={mode}
          onComplete={() => {
            router.replace("/");
            router.refresh();
          }}
        />
      </section>
      <footer className="auth-page-footer">
        <Link href="/">Continue reading without an account</Link>
        <Link href="/copyright">Privacy</Link>
      </footer>
    </main>
  );
}
