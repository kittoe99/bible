import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const store = await cookies();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !endpoint)
    return NextResponse.redirect(new URL("/auth/sign-in?error=setup", url));
  const supabase = createServerClient(endpoint, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) =>
        items.forEach(({ name, value, options }) =>
          store.set(name, value, options),
        ),
    },
  });
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  try {
    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : hash && ["signup", "email", "recovery"].includes(type ?? "")
        ? await supabase.auth.verifyOtp({
            token_hash: hash,
            type: type as EmailOtpType,
          })
        : null;
    return NextResponse.redirect(
      new URL(
        result && !result.error
          ? url.searchParams.get("recovery") === "1" || type === "recovery"
            ? "/auth/reset-password"
            : "/"
          : "/auth/sign-in?error=expired",
        url,
      ),
    );
  } catch {
    return NextResponse.redirect(new URL("/auth/sign-in?error=expired", url));
  }
}
