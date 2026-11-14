import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { Suspense } from "react";
import { SegmentedControl } from "@/components/segmented";
import { RankingView } from "@/components/views/ranking";
import { WhalesView } from "@/components/views/whales";
import { LaunchesView } from "@/components/views/launches";

export const revalidate = 600;

const VIEWS = [
  { key: "ranking", label: "Ranking", href: "/tokens" },
  { key: "whales", label: "Whales", href: "/tokens?view=whales" },
  { key: "launches", label: "Launches", href: "/tokens?view=launches" },
] as const;
type View = (typeof VIEWS)[number]["key"];
const pick = (v: string | string[] | undefined): View => (v === "whales" || v === "launches" ? v : "ranking");

export async function generateMetadata({ searchParams }: PageProps<"/tokens">): Promise<Metadata> {
  const v = pick((await searchParams).view);
  const t = v === "whales" ? "Whale moves" : v === "launches" ? "New launches" : "Token ranking";
  return { title: `${t} · Tokens`, description: "NEAR tokens ranked on depth, activity, distribution and flow, with whale moves and new launches as views of the same list." };
}

export default async function Tokens({ searchParams }: PageProps<"/tokens">) {
  const sp = await searchParams;
  const view = pick(sp.view);
  return (
    <>
      <PageTitle title="Tokens">Every token PRIX can measure on RHEA, scored on what it costs to trade, how much it trades, who holds it and where it’s flowing.</PageTitle>
      <div className="-mt-4 mb-8">
        <SegmentedControl label="Token views" items={[...VIEWS]} current={view} />
      </div>
      <Suspense key={view} fallback={<p className="flex min-h-11 items-center rounded-[20px] bg-surface px-4 text-[15px] text-slate">Loading live token data…</p>}>
        {view === "ranking" && <RankingView showLow={sp.low === "1"} sort={typeof sp.sort === "string" ? sp.sort : undefined} />}
        {view === "whales" && <WhalesView />}
        {view === "launches" && <LaunchesView />}
      </Suspense>
    </>
  );
}
