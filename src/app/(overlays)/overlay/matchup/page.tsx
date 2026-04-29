import { getTeamComparison, getDefaultSeason } from "@/lib/data";
import MatchupCarousel from "./MatchupCarousel";

export const dynamic = "force-dynamic";

export default async function MatchupOverlay(props: {
  searchParams: Promise<{ season?: string; t1?: string; t2?: string }>;
}) {
  const searchParams = await props.searchParams;
  const seasonId = searchParams.season || (await getDefaultSeason());
  const t1Id = parseInt(searchParams.t1 || "0", 10);
  const t2Id = parseInt(searchParams.t2 || "0", 10);

  if (!t1Id || !t2Id) {
    return (
      <div className="w-screen h-screen bg-transparent flex items-center justify-center">
        <div className="bg-black/80 backdrop-blur-md border border-white/10 border-t-2 border-t-val-red rounded-xl p-10 text-center">
          <p className="font-display text-xl text-white uppercase tracking-widest">Invalid Teams</p>
          <p className="font-sans text-sm text-gray-400 mt-2">
            Provide valid team IDs via <span className="font-mono text-val-blue">?t1=ID&t2=ID</span>
          </p>
        </div>
      </div>
    );
  }

  const { t1, t2 } = await getTeamComparison(t1Id, t2Id);

  if (!t1 || !t2) {
    return (
      <div className="w-screen h-screen bg-transparent flex items-center justify-center">
        <div className="bg-black/80 backdrop-blur-md border border-white/10 border-t-2 border-t-val-red rounded-xl p-10 text-center">
          <p className="font-display text-xl text-white uppercase tracking-widest">Teams Not Found</p>
          <p className="font-sans text-sm text-gray-400 mt-2">Could not load performance data for one or both teams.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center overflow-hidden">
      <MatchupCarousel t1={t1} t2={t2} seasonId={seasonId} />
    </div>
  );
}
