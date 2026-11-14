import type { Metadata } from "next";
import { FlowsView } from "@/components/views/flows";
import { DepthView } from "@/components/views/depth";
import { NetworkView } from "@/components/views/network";
import { IntegrityView } from "@/components/views/integrity";
import { getPublished } from "@/lib/server/published";
import { NoSnapshot } from "@/components/snapshot-ui";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Capital",
  description: "Where NEAR’s capital moves: NEAR Intents flows with coverage, the depth matrix, network and TVL charts, and the pools PRIX refused to count.",
};

const TABS = [
  ["flows", "Flows"],
  ["depth", "Depth"],
  ["network", "Network"],
  ["integrity", "Integrity"],
] as const;

export default async function Capital({ searchParams }: PageProps<"/capital">) {
  const sp = searchParams.then((p) => ({ w: typeof p.w === "string" ? p.w : undefined }));
  const { snapshot: s } = await getPublished();
  return (
    <>
      <h1 className="font-serif text-[28px] leading-[1.2] text-ink">Capital</h1>
      <p className="measure mt-2 text-[17px] text-slate">Where capital moves through NEAR Intents, what size the markets can take, and what PRIX left out.</p>
      <nav aria-label="Sections on this page" className="sticky top-14 z-30 -mx-4 mt-4 mb-6 border-b border-rule bg-paper px-4 sm:-mx-6 sm:px-6">
        <ul className="scroll-x flex gap-1">
          {TABS.map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-11 items-center px-3 text-[15px] font-medium whitespace-nowrap text-ink hover:underline">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid gap-14 [&>*]:min-w-0">
        <section id="flows" aria-label="Flows" className="scroll-mt-32">
          <FlowsView searchParams={sp} />
        </section>
        <section id="depth" aria-label="Depth" className="scroll-mt-32">
          <DepthView />
        </section>
        <section id="network" aria-labelledby="network-h" className="scroll-mt-32">
          <h2 id="network-h" className="mb-5 font-serif text-[28px] leading-[1.25] text-ink">Network</h2>
          {s ? <NetworkView s={s} /> : <NoSnapshot />}
        </section>
        <section id="integrity" aria-labelledby="integrity-h" className="scroll-mt-32">
          <h2 id="integrity-h" className="mb-2 font-serif text-[28px] leading-[1.25] text-ink">Integrity</h2>
          <p className="measure mb-5 text-[15px] text-slate">Pools whose reported value cannot be verified are left out of every number on this site.</p>
          {s ? <IntegrityView s={s} /> : <NoSnapshot />}
        </section>
      </div>
    </>
  );
}
