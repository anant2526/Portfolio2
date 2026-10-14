import type { Metadata } from "next";
import Studio from "@/components/studio/Studio";

export const metadata: Metadata = {
  title: "Twin Studio",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="font-display text-4xl font-bold">Twin Studio runs locally</h1>
          <p className="mt-3 text-mute">
            Start the project with <code className="font-mono text-bone">npm run dev</code> and open{" "}
            <code className="font-mono text-bone">localhost:3000/studio</code>.
          </p>
        </div>
      </main>
    );
  }
  return <Studio />;
}
