import { NextRequest, NextResponse } from "next/server";

const PLACES_API_URL =
  "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.regularOpeningHours",
  "places.types",
  "places.nextPageToken",
].join(",");

export interface Place {
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API key is not configured." },
      { status: 500 }
    );
  }

  const { businessType, location, pageToken } = await req.json();

  if (!businessType || !location) {
    return NextResponse.json(
      { error: "businessType and location are required." },
      { status: 400 }
    );
  }

  const query = `${businessType} in ${location}`;

  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: "en",
    maxResultCount: 20,
  };

  if (pageToken) {
    body.pageToken = pageToken;
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

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Google API error: ${errText}` },
      { status: response.status }
    );
  }

  const data = await response.json();

  const places: Place[] = (data.places ?? []).map(
    (p: Record<string, unknown>) => ({
      name: (p.displayName as { text: string } | undefined)?.text ?? "",
      address: (p.formattedAddress as string) ?? "",
      phone: (p.internationalPhoneNumber as string) ?? "",
      website: (p.websiteUri as string) ?? "",
      rating: (p.rating as number) ?? null,
      reviewCount: (p.userRatingCount as number) ?? null,
      status: (p.businessStatus as string) ?? "",
      mapsUrl: (p.googleMapsUri as string) ?? "",
      types: (p.types as string[]) ?? [],
    })
  );

  return NextResponse.json({
    places,
    nextPageToken: data.nextPageToken ?? null,
    total: places.length,
  });
}
