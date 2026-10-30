/**
 * Infers which team was attacking on a given round.
 *
 * HenrikDev's API has no side/role field anywhere -- not even structurally,
 * so there's no authoritative way to know which team started attacking.
 * This is an inference, not real data: within any round that had a spike
 * plant, the planter's team was attacking that round (captured as an
 * "anchor" via getRoundAttackTeam in src/lib/data.ts). Sides swap at
 * fixed points per the standard ruleset: rounds 1-12 are one half, 13-24
 * the second half (swapped), 25+ overtime in pairs (swapped every 2
 * rounds, first to +2 wins). A round's "block" identifies which of these
 * segments it falls in; blocks alternate strictly, so the attacking team
 * for any round can be derived from the nearest anchored round by flipping
 * per block-distance parity.
 */
function blockOf(roundNumber: number): number {
    if (roundNumber <= 24) return Math.floor((roundNumber - 1) / 12);
    return 2 + Math.floor((roundNumber - 25) / 2);
}

export function inferAttackingTeam(
    roundNumber: number,
    anchors: Record<number, number>,
    team1Id: number,
    team2Id: number
): number | null {
    const anchorRounds = Object.keys(anchors).map(Number);
    if (anchorRounds.length === 0) return null;

    const targetBlock = blockOf(roundNumber);
    let best: { round: number; blockDist: number; roundDist: number } | null = null;
    for (const r of anchorRounds) {
        const blockDist = Math.abs(blockOf(r) - targetBlock);
        const roundDist = Math.abs(r - roundNumber);
        if (!best || blockDist < best.blockDist || (blockDist === best.blockDist && roundDist < best.roundDist)) {
            best = { round: r, blockDist, roundDist };
        }
    }
    if (!best) return null;

    const anchorTeam = anchors[best.round];
    const otherTeam = anchorTeam === team1Id ? team2Id : team1Id;
    return best.blockDist % 2 === 0 ? anchorTeam : otherTeam;
}
