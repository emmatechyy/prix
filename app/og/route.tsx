import { ImageResponse } from "next/og";
import { getPublished } from "@/lib/server/published";
import { verdictSummary, VERDICT_WORD } from "@/lib/thesis/rail";
import { CLAIM_ORDER } from "@/lib/copy";

export const revalidate = 300;

const C = { Supported: "#0F7B5F", Mixed: "#A66A0B", "Not supported": "#B3382C", "Insufficient data": "#6B7686" } as const;
const PATH = { Supported: "M5 12.5l4.5 4.5L19 7", Mixed: "M4 14c2.5-4 5-4 8-2s5.5 2 8-2", "Not supported": "M6.5 6.5l11 11M17.5 6.5l-11 11", "Insufficient data": "M12 4a8 8 0 1 0 0.01 0" } as const;

/** Dynamic Open Graph image: the current verdict summary (spec §9). */
export async function GET() {
  const { verdicts, snapshot, thresholds } = await getPublished();
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const vs = CLAIM_ORDER.map((id) => byId.get(id)).filter((v) => !!v);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#EEF1F5", color: "#101B26", padding: 64, fontFamily: "serif" }}>
        <div style={{ fontSize: 36, display: "flex" }}>PRIX</div>
        <div style={{ fontSize: 60, marginTop: 24, lineHeight: 1.15, display: "flex" }}>The long-term case for NEAR, tested daily.</div>
        <div style={{ fontSize: 32, marginTop: 20, color: "#566576", display: "flex" }}>{verdicts.length ? `${verdictSummary(verdicts)}.` : "No published snapshot yet."}</div>
        <div style={{ display: "flex", marginTop: 40, gap: 12 }}>
          {vs.map((v) => (
            <div key={v.id} style={{ flex: 1, display: "flex", flexDirection: "column", border: `3px solid ${C[v.verdict]}`, borderRadius: 8, padding: "14px 16px", background: "#FFFFFF" }}>
              <div style={{ fontSize: 26, color: "#101B26", display: "flex" }}>{v.id}</div>
              <div style={{ fontSize: 19, color: C[v.verdict], marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C[v.verdict]} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={v.verdict === "Insufficient data" ? "3 3" : undefined}>
                  <path d={PATH[v.verdict]} />
                </svg>
                {VERDICT_WORD[v.verdict]}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", fontSize: 24, color: "#566576", display: "flex" }}>
          {snapshot ? `Snapshot ${snapshot.date} · Thresholds v${thresholds.t.version} (${thresholds.locked ? "locked" : "DRAFT, not locked"}) · prix-orcin.vercel.app` : "prix-orcin.vercel.app"}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
