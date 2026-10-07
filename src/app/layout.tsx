import type { Metadata } from "next";
import "./globals.css";
import "./mobile-reader.css";
import "./pickers.css";
import "./responsive-reader.css";
import "./auth.css";
import "./progress.css";
export const metadata: Metadata = {
  title: "Bible",
  description:
    "Read the Bible in KJV, WEB, or ASV. Save highlights, bookmarks, and notes.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
