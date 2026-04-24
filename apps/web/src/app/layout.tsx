import "./globals.css";
import { Inter } from "next/font/google";
import { Header } from "./header";
import { Footer } from "./footer";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Peron — train search for Romania",
  description:
    "A cleaner, faster, mobile-friendly frontend for Romania's national rail network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
