import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
import { GET } from "../src/app/auth/callback/route";

describe("authentication callbacks", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.resetAllMocks();
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    auth.verifyOtp.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  const callback = (query: string) =>
    GET(new NextRequest(`https://bible.example/auth/callback${query}`));

  it("exchanges confirmation codes and ignores external redirect parameters", async () => {
    const response = await callback(
      "?code=confirmation&next=https://evil.example",
    );
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("confirmation");
    expect(response.headers.get("location")).toBe("https://bible.example/");
  });
  it("opens password update only after successful recovery exchange", async () => {
    const response = await callback("?code=recovery&recovery=1");
    expect(response.headers.get("location")).toBe(
      "https://bible.example/auth/reset-password",
    );
    auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error("expired"),
    });
    expect(
      (await callback("?code=recovery&recovery=1")).headers.get("location"),
    ).toContain("/auth/sign-in?error=expired");
  });
  it("verifies recovery token hashes", async () => {
    const response = await callback("?token_hash=test-hash&type=recovery");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "test-hash",
      type: "recovery",
    });
    expect(response.headers.get("location")).toContain("/auth/reset-password");
  });
  it("rejects unsupported token types and missing tokens", async () => {
    for (const query of ["", "?token_hash=test&type=invite"]) {
      expect((await callback(query)).headers.get("location")).toContain(
        "error=expired",
      );
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("recovers from network errors and missing configuration", async () => {
    auth.exchangeCodeForSession.mockRejectedValue(new Error("offline"));
    expect((await callback("?code=test")).headers.get("location")).toContain(
      "error=expired",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect((await callback("?code=test")).headers.get("location")).toContain(
      "error=setup",
    );
  });
});
