import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { WEDDING } from "@/lib/saveTheDate";
import { SaveTheDate } from "./SaveTheDate";

// PUBLIC page — no sign-in, by design. It reads and writes nothing in
// Firestore (see src/lib/saveTheDate.ts), so it adds no rules surface and no
// read cost. Everything it shows is on the card itself.

// Cormorant Garamond italic for the names: calligraphic but every letter legible
// (a true script made "S" and "J" indistinguishable).
const serif = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  // Absolute base so WhatsApp/iMessage link previews can fetch the image.
  metadataBase: new URL("https://wedding-hq-ten.vercel.app"),
  title: `${WEDDING.shortNames} — Save the Date`,
  // No date here — link previews would give away the scratch reveal.
  description: `${WEDDING.partnerA} & ${WEDDING.partnerB} · Save the Date`,
  openGraph: {
    title: `${WEDDING.shortNames} — Save the Date`,
    description: "Tap to open your invitation.",
    images: ["/save-the-date/bg.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#075039",
};

// `?palette=classic` keeps the earlier, darker green as a backup to compare.
export default async function SaveTheDatePage({
  searchParams,
}: {
  searchParams: Promise<{ palette?: string }>;
}) {
  const { palette } = await searchParams;
  return (
    <div className={serif.variable}>
      <SaveTheDate classic={palette === "classic"} />
    </div>
  );
}
