import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function Setup() {
  return (
    <main className="document-page">
      <Link href="/" className="brand">
        Bible
      </Link>
      <h1>Save your study.</h1>
      <p>
        KJV, World English Bible, and American Standard Version are included
        with the app. Reading needs no account, API key, or Scripture
        subscription.
      </p>
      <h2>Optional cloud saving</h2>
      <ol>
        <li>
          Create a{" "}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Supabase project
          </a>
          .
        </li>
        <li>
          Apply <code>supabase/migrations/001_study.sql</code>, then{" "}
          <code>002_bundled_translations.sql</code>. Existing installations only
          need the second migration.
        </li>
        <li>
          Enable email/password authentication. Add your app origin and{" "}
          <code>/auth/callback</code> (including the recovery query variant) to
          Authentication → URL Configuration.
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and add the
          project URL and publishable key. Never use a service-role key in
          browser configuration.
        </li>
      </ol>
      <pre>
        <code>{`NEXT_PUBLIC_SUPABASE_URL=your-project-url\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key`}</code>
      </pre>
      <p>
        Restart with <code>npm run dev</code>, register, confirm your email, and
        sign in to save highlights, bookmarks, and notes across devices.
      </p>
      <Link className="button primary" href="/">
        <ArrowLeft size={16} />
        Back to reading
      </Link>
    </main>
  );
}
