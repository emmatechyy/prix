import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
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
  const raw = await searchParams;
  const sp = Promise.resolve({ w: typeof raw.w === "string" ? raw.w : undefined });
  const route = raw.route === "intents" || raw.route === "rhea" ? raw.route : "best";
  const { snapshot: s } = await getPublished();
  return (
    <>
      <PageTitle title="Capital">Where capital moves through NEAR Intents, what size the markets can take, and what PRIX left out.</PageTitle>
      <nav aria-label="Sections on this page" className="sticky top-[84px] z-30 -mt-4 mb-8 rounded-full bg-surface/90 px-1 py-1 backdrop-blur-md w-max max-w-full">
        <ul className="scroll-x flex gap-1">
          {TABS.map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium whitespace-nowrap text-ink hover:bg-wash">
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
          <DepthView route={route} />
        </section>
        <section id="network" aria-labelledby="network-h" className="scroll-mt-32">
          <h2 id="network-h" className="mb-6 display text-[44px] text-ink sm:text-[56px]">Network</h2>
          {s ? <NetworkView s={s} /> : <NoSnapshot />}
        </section>
        <section id="integrity" aria-labelledby="integrity-h" className="scroll-mt-32">
          <h2 id="integrity-h" className="mb-2 display text-[44px] text-ink sm:text-[56px]">Integrity</h2>
          <p className="measure mb-5 text-[15px] text-slate">Pools whose reported value cannot be verified are left out of every number on this site.</p>
          {s ? <IntegrityView s={s} /> : <NoSnapshot />}
        </section>
      </div>
    </>
  );
}
