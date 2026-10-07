# Bible

A minimal, responsive Bible reader built with Next.js App Router, TypeScript, Tailwind CSS, and optional Supabase cloud saving. Opens straight to Scripture. Phones use drawers and bottom navigation, tablets have a wider reading surface, and desktops have a persistent book sidebar with notes beside the reader on wide screens. White and gray surfaces, soft shadows, keyboard-friendly pickers, and reduced-motion support.

## Run locally

Use Node.js 24 and npm (Node.js 22.12+ is also supported).

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000. **Scripture works immediately without any credentials.** KJV is the default, with WEB and ASV included. Supabase is needed only for private cloud notes, bookmarks, and highlights; the app never claims to save to the cloud when it is not connected.

## Connect Supabase

This app targets [Supabase project `wujruiqjkjgtptlcnmvm`](https://supabase.com/dashboard/project/wujruiqjkjgtptlcnmvm). The public project URL is included in `.env.example`; no credentials are committed. The schema and translation migrations have been applied to this project. Live transactional checks verified note saves, stale-edit conflicts, highlights, bookmarks, reading preferences, account isolation, and anonymous access denial. Verification data was rolled back. The Supabase security advisor reports no findings after restricting a pre-existing administrative helper. Vercel environment variables and production Auth redirect URLs still need to be configured.

1. For a new project, apply every SQL file in `supabase/migrations/` in filename order. The configured project already has these migrations. Local filenames match the hosted migration history; do not rerun applied migrations. The schema includes private study records, reading preferences, indexes, row-level security policies, and atomic note/annotation functions.
2. Enable email/password authentication and email confirmation. Configure production SMTP before public use.
3. Set **Authentication → URL Configuration → Site URL** to your app origin. Allow these redirect URLs for local development and their equivalents for your production origin:
   - `http://127.0.0.1:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback?recovery=1`
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. A legacy anonymous key also works in the publishable-key variable. Never put a service-role key in a public variable.
5. Registration uses PKCE confirmation links. For confirmation links that also work when opened on another device, change the confirmation email template link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`. For password recovery, use `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`. The callback supports both the normal code flow and these token-hash flows.

The browser uses Supabase Auth and RLS directly. No elevated database credential is needed by the app. All note writes use a revision-checked RPC; conflicts preserve the local draft and offer **Save draft as a copy** or **Discard draft and use saved note**. Highlights and bookmarks are independent, canonical per-verse records and change transactionally across a selection.

### Vercel environment

In Vercel → Project → Settings → Environment Variables, set these for Production (and Preview if needed):

| Variable                               | Value                                                             |
| -------------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://wujruiqjkjgtptlcnmvm.supabase.co`                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key from Supabase → Settings → API Keys |

A legacy `anon` key also works in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not use a secret or `service_role` key. Redeploy after adding or changing these variables because Next.js embeds public variables at build time.

In Supabase → Authentication → URL Configuration, set **Site URL** to your production Vercel origin and add `https://YOUR-DOMAIN/auth/callback` and `https://YOUR-DOMAIN/auth/callback?recovery=1` as redirect URLs. Keep email/password authentication enabled. Add equivalent callback URLs for any preview deployments where sign-in is needed. These settings allow verification and password-reset links to return to your app.

## Bundled Scripture — no API

All three editions are checked into `public/bibles/v1/`, split into 1,189 chapter JSON files per edition (66 books). The browser loads only the requested chapter from this app. No external Scripture API, subscription, API keys, tracking scripts, or runtime downloads from eBible.org are used. `npm run dev` and `npm run build` do not require reaching a Scripture provider.

| Edition | Text source                                                                                | License                                                                          |
| ------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| KJV     | [eBible.org / CrossWire](https://ebible.org/eng-kjv/copyright.htm), standardized 1769 text | Public domain outside the UK; source notice preserves the UK Crown-rights caveat |
| WEB     | [World English Bible Classic](https://ebible.org/eng-web/copyright.htm)                    | Public domain; the name is a trademark and must not be used for modified text    |
| ASV     | [American Standard Version, 1901](https://ebible.org/eng-asv/copyright.htm)                | Public domain                                                                    |

NIV and ESV were replaced with freely distributable editions. Existing notes retain their original translation label and open the same passage in KJV; old reading preferences retain the book/chapter and switch to KJV. The bundled-translations migration enables WEB/ASV study material without changing older notes.

The import uses the publishers' verse-per-line files. Explicit source book identifiers are mapped to the app's canonical identifiers; source verse numbers, supplied-word brackets, paragraph marks, and Psalm superscriptions are preserved. Blank verses remain gaps, never renumbered. Only the 66-book Protestant canon is included. Source copyright notices, SHA-256 archive hashes, and counts are recorded in `public/bibles/v1/sources.json` and adjacent source-notice HTML files.

To reproduce the data (only maintainers need Python 3 and curl):

```powershell
python scripts/import-bibles.py --download
```

Downloads are cached in ignored `.bible-sources/`. The importer rejects archive checksum changes against the committed manifest, duplicate/out-of-order references, unknown line formats, and incomplete chapters. Upstream revisions must be reviewed before deliberately updating the manifest. This step is **not** needed to run or deploy the app.

Bundling removes external provider dependencies; it does not install a full offline PWA. The app's host still needs to be reachable for uncached assets.

## Authentication

Open `/auth/sign-in` or use **Sign in** in the reader. The shared account form supports email/password sign-in, account creation with password confirmation, confirmation email resend with a cooldown, password visibility, and password reset. Successful sign-in returns to Scripture. Reset links pass through `/auth/callback` to `/auth/reset-password`; invalid or expired links provide a recovery path. Reading always remains available without an account.

Local authentication reads `.env.local` (ignored by Git). Vercel needs the public environment variables and Supabase redirect URLs listed above. No secret or service-role key is required. Browser authentication tests use mocked responses; they do not send real verification or reset emails.

## Using the app

- Choose a book, chapter, and translation. Reference lookup accepts names and common aliases, such as `John 3:16`, `Psalm 23`, and `1 John 3:16–18`.
- Click/tap verses to toggle a selection; Shift-click selects an inclusive range. All verse controls also work with keyboard focus and Enter/Space.
- Pick a highlight color, bookmark the selection, or attach a note. Sign-in is required for these actions.
- Notes autosave after 850 ms. “Saved to your account” means the write was confirmed. Failed writes retain a device draft when browser storage is available. Reopen unsynced drafts in **My saved library**.
- Saved library filters cover notes, bookmarks, and highlights. Search matches note text, reference, and original translation. Note deletion requires confirmation.
- Annotations match canonical verse numbers across translations; absent verses are not silently reassigned. Each note retains the version in which it was written.
- Reading preferences restore from this browser and sync for signed-in accounts. Library data refreshes after mutations, on window focus, and when the connection returns. It is not a real-time collaborative editor.

Device drafts are namespaced by account but not encrypted. Sign-out hides them without deleting unsynced work. Clear site data on shared devices after ensuring notes are saved. Full offline Scripture reading and background offline write queues are not included.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

- Corpus tests read every bundled chapter, validate ordered verse numbers and nonempty text, verify source passages and numbering gaps, and test local loading errors.
- Navigation tests cover all 66 books and 1,189 chapters, reference parsing, and legacy preference migration.
- Database tests apply all migrations in PGlite with real PostgreSQL roles and simulated `auth.uid()` identities. They verify account isolation, anonymous denial, optimistic conflicts, transactional annotations, and input constraints.
- Browser tests use real bundled Scripture for responsive screens from 320px to 1920px, translation switching, restoration, and retry behavior. Study-flow tests use synthetic passages and mocked Supabase transport for auth, autosave, conflicts, cross-session state, and deletion. Accessibility checks use axe and keyboard interactions.
- Screenshots and failure traces are written to ignored `test-results/`.

The live database has been verified separately through Supabase. Email delivery and end-to-end browser cloud saving still require the Vercel environment variables and production Auth redirect URLs; these have not been verified on a deployed app.

## Architecture

- `src/app`: reader, auth callback, optional cloud setup, attribution/privacy pages.
- `src/components`: responsive reading/library shell, accessible pickers, account dialog, conflict-aware notes.
- `src/lib`: canon, validated static chapter loading, Supabase browser client, local drafts/preferences.
- `public/bibles/v1`: complete bundled Scripture and source provenance.
- `scripts/import-bibles.py`: reproducible, checksum-pinned Scripture importer.
- `supabase/migrations`: schema, RLS policies, atomic functions, translation compatibility.
- `tests`: corpus, unit, database, and browser checks.

Deployment is outside this implementation. Use a Node-capable Next.js host and include the `public` directory with the deployment.
