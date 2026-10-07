import AuthScreen from "@/components/auth-screen";
export const metadata = { title: "Sign in · Bible" };
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <AuthScreen linkError={error === "expired"} />;
}
