import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function Copyright() {
  return (
    <main className="document-page">
      <Link href="/" className="brand">
        Bible
      </Link>
      <h1>Scripture &amp; your privacy.</h1>
      <h2>Included translations</h2>
      <p>
        All 66 books are bundled locally in each edition, courtesy of
        eBible.org. The reader requests chapter files from this app and sends no
        Scripture usage reports to outside providers.
      </p>
      <p>
        <a href="https://ebible.org/eng-kjv/copyright.htm">
          King James Version (KJV)
        </a>
        : the standardized 1769 text, courtesy of CrossWire and eBible.org.
        Public domain outside the United Kingdom; the source notice explains the
        UK Crown rights.{" "}
        <a href="/bibles/v1/KJV-source-notice.html">Original notice</a>.
      </p>
      <p>
        <a href="https://ebible.org/eng-web/copyright.htm">
          World English Bible Classic (WEB)
        </a>
        : public domain. “World English Bible” is a trademark of eBible.org;
        modified text must not be distributed under that name.{" "}
        <a href="/bibles/v1/WEB-source-notice.html">Original notice</a>.
      </p>
      <p>
        <a href="https://ebible.org/eng-asv/copyright.htm">
          American Standard Version (ASV, 1901)
        </a>
        : public domain.{" "}
        <a href="/bibles/v1/ASV-source-notice.html">Original notice</a>.
      </p>
      <p>
        Source verse numbering, supplied-word brackets, and Psalm
        superscriptions are preserved. Empty source verses remain numbering
        gaps. NIV and ESV are no longer offered; older notes retain their
        original translation labels and reopen in KJV.
      </p>
      <h2>Your study stays private</h2>
      <p>
        When configured, Supabase stores notes, bookmarks, highlights, and
        reading preferences under your signed-in account. Row-level security
        restricts access to your own records. No Scripture provider receives
        your notes or email address.
      </p>
      <p>
        Reading preferences and unsaved note drafts are also stored on this
        device. Drafts are separated by account and removed after a confirmed
        cloud save. Signing out hides drafts without erasing browser storage.
        Clear site data on shared devices after saving your work; clearing it
        removes unsynced drafts.
      </p>
      <h2>Saving and connection failures</h2>
      <p>
        A note is marked saved only after the server confirms the write. Failed
        saves keep a local draft when device storage is available. Conflicting
        edits are preserved for resolution. Bundled Scripture needs no external
        API, but the web app must still be reachable; full offline installation
        is not included.
      </p>
      <Link className="button primary" href="/">
        <ArrowLeft size={16} />
        Back to reading
      </Link>
    </main>
  );
}
