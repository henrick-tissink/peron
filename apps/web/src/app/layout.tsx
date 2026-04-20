import "./globals.css";

export const metadata = {
  title: "Peron",
  description: "A cleaner frontend for Romanian train search",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <body className="antialiased">{children}</body>
    </html>
  );
}
