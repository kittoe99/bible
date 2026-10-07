"use client";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import Dialog from "./dialog";
import AuthForm from "./auth-form";

export default function AuthDialog({
  client,
  onClose,
  recovery = false,
}: {
  client: SupabaseClient | null;
  onClose: () => void;
  recovery?: boolean;
}) {
  return (
    <Dialog title="Account" onClose={onClose} className="auth-modal">
      <AuthForm
        client={client}
        initialMode={recovery ? "update" : "signin"}
        onComplete={() => {
          onClose();
          history.replaceState({}, "", location.pathname);
        }}
      />
      <Link href="/auth/sign-in" className="auth-page-link">
        Open sign-in page
      </Link>
    </Dialog>
  );
}
