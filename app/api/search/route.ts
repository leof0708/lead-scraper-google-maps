import { NextRequest, NextResponse } from "next/server";

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.types",
  "nextPageToken",
].join(",");

export interface Place {
  id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  mapsUrl: string;
  types: string[];
}

interface LocationBox {
  low: { lat: number; lng: number };
  high: { lat: number; lng: number };
}

function mapPlace(p: Record<string, unknown>): Place {
  return {
    id: (p.id as string) ?? "",
    name: (p.displayName as { text: string } | undefined)?.text ?? "",
    address: (p.formattedAddress as string) ?? "",
    phone: (p.internationalPhoneNumber as string) ?? "",
    website: (p.websiteUri as string) ?? "",
    rating: (p.rating as number) ?? null,
    reviewCount: (p.userRatingCount as number) ?? null,
    status: (p.businessStatus as string) ?? "",
    mapsUrl: (p.googleMapsUri as string) ?? "",
    types: (p.types as string[]) ?? [],
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API key is not configured." },
      { status: 500 }
    );
  }

  const {
    businessType,
    location,
    maxLeads = 20,
    locationBox,
  }: {
    businessType: string;
    location: string;
    maxLeads?: number;
    locationBox?: LocationBox;
  } = await req.json();

  if (!businessType || !location) {
    return NextResponse.json(
      { error: "businessType and location are required." },
      { status: 400 }
    );
  }

  const query = `${businessType} in ${location}`;
  // When using a locationBox, cap per-cell at 60 (Google's hard limit per query)
  const target = locationBox
    ? Math.min(Math.max(1, maxLeads), 60)
    : Math.min(Math.max(1, maxLeads), 60);

  const allPlaces: Place[] = [];
  let pageToken: string | undefined = undefined;
  let apiCallsMade = 0;

  while (allPlaces.length < target) {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: "en",
      maxResultCount: Math.min(20, target - allPlaces.length),
    };

    if (pageToken) body.pageToken = pageToken;

    if (locationBox) {
      body.locationRestriction = {
        rectangle: {
          low: { latitude: locationBox.low.lat, longitude: locationBox.low.lng },
          high: { latitude: locationBox.high.lat, longitude: locationBox.high.lng },
        },
      };
    }

    const response = await fetch(PLACES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    apiCallsMade++;

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Google API error: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const batch: Place[] = (data.places ?? []).map(mapPlace);
    allPlaces.push(...batch);

    if (!data.nextPageToken || batch.length === 0) break;
    pageToken = data.nextPageToken;
  }

  return NextResponse.json({
    places: allPlaces.slice(0, target),
    apiCallsMade,
  });
}
