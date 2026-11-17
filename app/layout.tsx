import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Funding Radar — investors who already backed companies like yours",
  description: "Describe your startup. Get a ranked list of investors, each backed by a live link to a real deal in a similar company.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="relative grid h-7 w-7 place-items-center rounded-full border border-brand/60">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              <span className="absolute inset-0 animate-blip rounded-full border border-brand/60" />
            </span>
            Funding Radar
          </Link>
          <span className="hidden text-xs text-mute sm:block">Powered by TinyFish TinySet · Search · Fetch · Agent</span>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-5 py-10 text-xs text-mute">
          Every investor listed links to a live page naming the company and the investor. Verify before you reach out.
        </footer>
      </body>
    </html>
  );
}
