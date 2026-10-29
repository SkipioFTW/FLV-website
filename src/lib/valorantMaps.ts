export type MapCalibration = {
    displayIcon: string;
    xMultiplier: number;
    yMultiplier: number;
    xScalarToAdd: number;
    yScalarToAdd: number;
};

// Per-map projection constants + minimap image, sourced from valorant-api.com
// (https://valorant-api.com/v1/maps) -- the same constants Riot's own client
// uses to place callouts on the minimap.
export const VALORANT_MAP_CALIBRATION: Record<string, MapCalibration> = {
    Ascent: { xMultiplier: 0.00007, yMultiplier: -0.00007, xScalarToAdd: 0.813895, yScalarToAdd: 0.573242, displayIcon: "https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/displayicon.png" },
    Bind: { xMultiplier: 0.000059, yMultiplier: -0.000059, xScalarToAdd: 0.576941, yScalarToAdd: 0.967566, displayIcon: "https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/displayicon.png" },
    Haven: { xMultiplier: 0.000075, yMultiplier: -0.000075, xScalarToAdd: 1.09345, yScalarToAdd: 0.642728, displayIcon: "https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/displayicon.png" },
    Split: { xMultiplier: 0.000078, yMultiplier: -0.000078, xScalarToAdd: 0.842188, yScalarToAdd: 0.697578, displayIcon: "https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/displayicon.png" },
    Breeze: { xMultiplier: 0.00007, yMultiplier: -0.00007, xScalarToAdd: 0.465123, yScalarToAdd: 0.833078, displayIcon: "https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/displayicon.png" },
    Icebox: { xMultiplier: 0.000072, yMultiplier: -0.000072, xScalarToAdd: 0.460214, yScalarToAdd: 0.304687, displayIcon: "https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/displayicon.png" },
    Lotus: { xMultiplier: 0.000072, yMultiplier: -0.000072, xScalarToAdd: 0.454789, yScalarToAdd: 0.917752, displayIcon: "https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/displayicon.png" },
    Sunset: { xMultiplier: 0.000078, yMultiplier: -0.000078, xScalarToAdd: 0.5, yScalarToAdd: 0.515625, displayIcon: "https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/displayicon.png" },
    Pearl: { xMultiplier: 0.000078, yMultiplier: -0.000078, xScalarToAdd: 0.480469, yScalarToAdd: 0.916016, displayIcon: "https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/displayicon.png" },
    Abyss: { xMultiplier: 0.000081, yMultiplier: -0.000081, xScalarToAdd: 0.5, yScalarToAdd: 0.5, displayIcon: "https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/displayicon.png" },
    Corrode: { xMultiplier: 0.00007, yMultiplier: -0.00007, xScalarToAdd: 0.526158, yScalarToAdd: 0.5, displayIcon: "https://media.valorant-api.com/maps/1c18ab1f-420d-0d8b-71d0-77ad3c439115/displayicon.png" },
    Fracture: { xMultiplier: 0.000078, yMultiplier: -0.000078, xScalarToAdd: 0.556952, yScalarToAdd: 1.155886, displayIcon: "https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/displayicon.png" },
};

/**
 * Project a raw world x/y (as returned by HenrikDev/Riot's match API) onto a
 * normalized 0..1 minimap position. Axes are swapped -- world Y drives the
 * minimap's X axis and vice versa; this matches Riot's own client behavior.
 * Returns null for maps with no known calibration (e.g. very old/unused maps).
 */
export function projectToMinimap(x: number, y: number, mapName: string): { left: number; top: number } | null {
    const cal = VALORANT_MAP_CALIBRATION[mapName];
    if (!cal) return null;
    return {
        left: y * cal.xMultiplier + cal.xScalarToAdd,
        top: x * cal.yMultiplier + cal.yScalarToAdd,
    };
}
