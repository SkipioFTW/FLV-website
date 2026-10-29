// Agent minimap portraits, sourced from valorant-api.com (https://valorant-api.com/v1/agents)
// -- Riot's own circular face-crop asset, keyed by display name exactly as stored in
// match_stats_map.agent (see AGENTS list in /api/admin/maps/parse/route.ts).
export const VALORANT_AGENT_PORTRAITS: Record<string, string> = {
    "Astra": "https://media.valorant-api.com/agents/41fb69c1-4189-7b37-f117-bcaf1e96f1bf/minimapportrait.png",
    "Breach": "https://media.valorant-api.com/agents/5f8d3a7f-467b-97f3-062c-13acf203c006/minimapportrait.png",
    "Brimstone": "https://media.valorant-api.com/agents/9f0d8ba9-4140-b941-57d3-a7ad57c6b417/minimapportrait.png",
    "Chamber": "https://media.valorant-api.com/agents/22697a3d-45bf-8dd7-4fec-84a9e28c69d7/minimapportrait.png",
    "Clove": "https://media.valorant-api.com/agents/1dbf2edd-4729-0984-3115-daa5eed44993/minimapportrait.png",
    "Cypher": "https://media.valorant-api.com/agents/117ed9e3-49f3-6512-3ccf-0cada7e3823b/minimapportrait.png",
    "Deadlock": "https://media.valorant-api.com/agents/cc8b64c8-4b25-4ff9-6e7f-37b4da43d235/minimapportrait.png",
    "Fade": "https://media.valorant-api.com/agents/dade69b4-4f5a-8528-247b-219e5a1facd6/minimapportrait.png",
    "Gekko": "https://media.valorant-api.com/agents/e370fa57-4757-3604-3648-499e1f642d3f/minimapportrait.png",
    "Harbor": "https://media.valorant-api.com/agents/95b78ed7-4637-86d9-7e41-71ba8c293152/minimapportrait.png",
    "Hush": "https://media.valorant-api.com/agents/ddd5a15c-4fbe-42fa-3789-11a55ca5ee04/minimapportrait.png",
    "Iso": "https://media.valorant-api.com/agents/0e38b510-41a8-5780-5e8f-568b2a4f2d6c/minimapportrait.png",
    "Jett": "https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/minimapportrait.png",
    "KAY/O": "https://media.valorant-api.com/agents/601dbbe7-43ce-be57-2a40-4abd24953621/minimapportrait.png",
    "Killjoy": "https://media.valorant-api.com/agents/1e58de9c-4950-5125-93e9-a0aee9f98746/minimapportrait.png",
    "Miks": "https://media.valorant-api.com/agents/7c8a4701-4de6-9355-b254-e09bc2a34b72/minimapportrait.png",
    "Neon": "https://media.valorant-api.com/agents/bb2a4828-46eb-8cd1-e765-15848195d751/minimapportrait.png",
    "Omen": "https://media.valorant-api.com/agents/8e253930-4c05-31dd-1b6c-968525494517/minimapportrait.png",
    "Phoenix": "https://media.valorant-api.com/agents/eb93336a-449b-9c1b-0a54-a891f7921d69/minimapportrait.png",
    "Raze": "https://media.valorant-api.com/agents/f94c3b30-42be-e959-889c-5aa313dba261/minimapportrait.png",
    "Reyna": "https://media.valorant-api.com/agents/a3bfb853-43b2-7238-a4f1-ad90e9e46bcc/minimapportrait.png",
    "Sage": "https://media.valorant-api.com/agents/569fdd95-4d10-43ab-ca70-79becc718b46/minimapportrait.png",
    "Skye": "https://media.valorant-api.com/agents/6f2a04ca-43e0-be17-7f36-b3908627744d/minimapportrait.png",
    "Sova": "https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/minimapportrait.png",
    "Tejo": "https://media.valorant-api.com/agents/b444168c-4e35-8076-db47-ef9bf368f384/minimapportrait.png",
    "Veto": "https://media.valorant-api.com/agents/92eeef5d-43b5-1d4a-8d03-b3927a09034b/minimapportrait.png",
    "Viper": "https://media.valorant-api.com/agents/707eab51-4836-f488-046a-cda6bf494859/minimapportrait.png",
    "Vyse": "https://media.valorant-api.com/agents/efba5359-4016-a1e5-7626-b1ae76895940/minimapportrait.png",
    "Waylay": "https://media.valorant-api.com/agents/df1cb487-4902-002e-5c17-d28e83e78588/minimapportrait.png",
    "Yoru": "https://media.valorant-api.com/agents/7f94d92c-4234-0a36-9646-3a87eb8b5c89/minimapportrait.png",
};

/**
 * Direction a player is facing, as a unit vector in the SAME screen-space
 * coordinate system projectToMinimap() produces (left/top %, y grows downward).
 *
 * Derived from the position projection math: minimapX depends on worldY,
 * minimapY depends on worldX, and every current map has yMultiplier = -xMultiplier,
 * so the world-space facing vector (cos(view_radians), sin(view_radians)) carries
 * through as (sin(view_radians), -cos(view_radians)) in minimap screen space.
 * Unverified against real footage -- if cones visibly point the wrong way for a
 * known kill angle, this is the formula to revisit first.
 */
export function viewDirection(view_radians: number): { x: number; y: number } {
    return { x: Math.sin(view_radians), y: -Math.cos(view_radians) };
}
