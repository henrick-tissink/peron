import type { Station } from "@peron/types";

const placeholder: Station = { name: "București Nord", isImportant: true };

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">Peron</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Foundation scaffold. Example station from the types package:{" "}
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
          {placeholder.name}
        </code>
      </p>
    </main>
  );
}
