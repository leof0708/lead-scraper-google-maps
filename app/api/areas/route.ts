import { NextRequest, NextResponse } from "next/server";

export interface Cell {
  low: { lat: number; lng: number };
  high: { lat: number; lng: number };
  label: string;
}

// Fixed search radius in km — covers well beyond most city limits
const RADIUS_KM = 27;

export async function POST(req: NextRequest) {
  const { location, maxLeads } = await req.json();

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(location)}&format=json&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "LeadScraperApp/1.0 (personal-use)" },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 502 });
  }

  const data = await res.json();

  if (!data.length) {
    return NextResponse.json(
      { error: `Could not find "${location}" on the map.` },
      { status: 404 }
    );
  }

  // Use the city center point, not the bounding box
  const centerLat = parseFloat(data[0].lat);
  const centerLng = parseFloat(data[0].lon);

  // Convert km radius to degrees
  // 1° latitude ≈ 111 km everywhere
  // 1° longitude ≈ 111 km × cos(lat) — shrinks toward the poles
  const latDelta = RADIUS_KM / 111.0;
  const lngDelta = RADIUS_KM / (111.0 * Math.cos(centerLat * (Math.PI / 180)));

  const eLat0 = centerLat - latDelta;
  const eLat1 = centerLat + latDelta;
  const eLon0 = centerLng - lngDelta;
  const eLon1 = centerLng + lngDelta;

  // Each cell yields up to 60 results. Pick the smallest grid that covers maxLeads.
  // 1×1 → 60, 2×2 → 240, 3×3 → 540, 4×4 → 960
  const gridSize =
    maxLeads <= 60 ? 1 : maxLeads <= 240 ? 2 : maxLeads <= 540 ? 3 : 4;

  const latStep = (eLat1 - eLat0) / gridSize;
  const lonStep = (eLon1 - eLon0) / gridSize;
  const total = gridSize * gridSize;

  const cells: Cell[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      cells.push({
        low: {
          lat: eLat0 + row * latStep,
          lng: eLon0 + col * lonStep,
        },
        high: {
          lat: eLat0 + (row + 1) * latStep,
          lng: eLon0 + (col + 1) * lonStep,
        },
        label: `Area ${row * gridSize + col + 1} / ${total}`,
      });
    }
  }

  return NextResponse.json({ cells });
}
