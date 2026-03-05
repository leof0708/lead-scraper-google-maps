"use client";

import { useState } from "react";
import { Place } from "./api/search/route";

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(full)}
      {half ? "½" : ""}
      {"☆".repeat(5 - full - (half ? 1 : 0))}
      <span className="text-gray-500 ml-1 text-xs">{rating.toFixed(1)}</span>
    </span>
  );
}

export default function Home() {
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!businessType.trim() || !location.trim()) return;
    setLoading(true);
    setError("");
    setPlaces([]);
    setNextPageToken(null);
    setSearched(false);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType, location }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setPlaces(data.places);
      setNextPageToken(data.nextPageToken);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType, location, pageToken: nextPageToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Load more failed");
      setPlaces((prev) => [...prev, ...data.places]);
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExport(format: "csv" | "xlsx") {
    if (!places.length) return;
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ places, format }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">
            Google Maps Lead Scraper
          </h1>
          <p className="text-gray-400">
            Find business leads using the official Google Places API
          </p>
        </div>

        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 shadow-xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Type of Business
              </label>
              <input
                type="text"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="e.g. plumber, dentist, restaurant"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                City, Country
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. London, UK"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
            {places.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => handleExport("csv")}
                  className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-lg transition-colors text-sm"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("xlsx")}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-5 py-3 rounded-lg transition-colors text-sm"
                >
                  Export Excel
                </button>
                <span className="text-gray-400 text-sm ml-auto">
                  {places.length} result{places.length !== 1 ? "s" : ""} found
                </span>
              </>
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-xl p-4 mb-6">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse"
              >
                <div className="h-4 bg-gray-700 rounded w-1/3 mb-3" />
                <div className="h-3 bg-gray-800 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-800 rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && places.length > 0 && (
          <div className="space-y-4">
            {places.map((place, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-semibold text-white truncate">
                        {place.name}
                      </h2>
                      {place.status === "OPERATIONAL" ? (
                        <span className="shrink-0 bg-green-900/60 text-green-400 text-xs px-2 py-0.5 rounded-full">
                          Open
                        </span>
                      ) : place.status ? (
                        <span className="shrink-0 bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">
                          {place.status.replace(/_/g, " ")}
                        </span>
                      ) : null}
                    </div>
                    {place.rating && (
                      <div className="mb-2">
                        <StarRating rating={place.rating} />
                        {place.reviewCount && (
                          <span className="text-gray-500 text-xs ml-1">
                            ({place.reviewCount.toLocaleString()} reviews)
                          </span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {place.address && (
                        <div className="text-gray-400">
                          <span className="text-gray-600">Address: </span>
                          {place.address}
                        </div>
                      )}
                      {place.phone && (
                        <div className="text-gray-400">
                          <span className="text-gray-600">Phone: </span>
                          <a
                            href={`tel:${place.phone}`}
                            className="text-blue-400 hover:underline"
                          >
                            {place.phone}
                          </a>
                        </div>
                      )}
                      {place.website && (
                        <div className="text-gray-400 col-span-full">
                          <span className="text-gray-600">Website: </span>
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline truncate inline-block max-w-xs align-bottom"
                          >
                            {place.website.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <a
                    href={place.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    View on Maps
                  </a>
                </div>
              </div>
            ))}

            {nextPageToken && (
              <div className="text-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg transition-colors font-medium"
                >
                  {loadingMore ? "Loading..." : "Load More Results"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && searched && places.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            No results found. Try a different business type or location.
          </div>
        )}
      </div>
    </main>
  );
}
