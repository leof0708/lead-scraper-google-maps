"use client";

import { useState, useEffect } from "react";
import { Place } from "./api/search/route";

const DB_KEY = "leads_db_v1";

function loadDb(): Set<string> {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDb(db: Set<string>) {
  localStorage.setItem(DB_KEY, JSON.stringify([...db]));
}

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
  const [maxLeads, setMaxLeads] = useState(20);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [apiCallsMade, setApiCallsMade] = useState(0);
  const [db, setDb] = useState<Set<string>>(new Set());
  const [dbCount, setDbCount] = useState(0);
  const [exportNewOnly, setExportNewOnly] = useState(true);

  useEffect(() => {
    const loaded = loadDb();
    setDb(loaded);
    setDbCount(loaded.size);
  }, []);

  function isNew(place: Place) {
    return !db.has(place.id);
  }

  const newLeads = places.filter(isNew);
  const dupLeads = places.filter((p) => !isNew(p));

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!businessType.trim() || !location.trim()) return;
    setLoading(true);
    setError("");
    setPlaces([]);
    setSearched(false);
    setApiCallsMade(0);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType, location, maxLeads }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setPlaces(data.places);
      setApiCallsMade(data.apiCallsMade);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveToDb() {
    const updated = new Set(db);
    newLeads.forEach((p) => updated.add(p.id));
    saveDb(updated);
    setDb(updated);
    setDbCount(updated.size);
  }

  function handleClearDb() {
    if (!confirm(`Clear all ${dbCount} saved leads from the database? This cannot be undone.`)) return;
    saveDb(new Set());
    setDb(new Set());
    setDbCount(0);
  }

  async function handleExport(format: "csv" | "xlsx") {
    const toExport = exportNewOnly ? newLeads : places;
    if (!toExport.length) return;
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ places: toExport, format }),
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
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Google Maps Lead Scraper
            </h1>
            <p className="text-gray-400">
              Find business leads using the official Google Places API
            </p>
          </div>
          {/* DB Status */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 text-right">
            <div className="text-xs text-gray-500 mb-0.5">Leads in database</div>
            <div className="text-2xl font-bold text-white">{dbCount.toLocaleString()}</div>
            {dbCount > 0 && (
              <button
                onClick={handleClearDb}
                className="text-xs text-red-500 hover:text-red-400 mt-1 transition-colors"
              >
                Clear DB
              </button>
            )}
          </div>
        </div>

        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 shadow-xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Number of Leads
              </label>
              <select
                value={maxLeads}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={20}>20 leads (1 API call)</option>
                <option value={40}>40 leads (2 API calls)</option>
                <option value={60}>60 leads (3 API calls)</option>
                <option value={80}>80 leads (4 API calls)</option>
                <option value={100}>100 leads (5 API calls)</option>
              </select>
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
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exportNewOnly}
                    onChange={(e) => setExportNewOnly(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Export new leads only
                </label>
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
                {newLeads.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveToDb}
                    className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-5 py-3 rounded-lg transition-colors text-sm"
                  >
                    Save {newLeads.length} new to DB
                  </button>
                )}
              </>
            )}

            {searched && (
              <div className="ml-auto flex items-center gap-3 text-sm">
                {apiCallsMade > 0 && (
                  <span className="text-gray-500">
                    {apiCallsMade} API call{apiCallsMade !== 1 ? "s" : ""} used
                  </span>
                )}
                {dupLeads.length > 0 && (
                  <span className="bg-yellow-900/40 text-yellow-400 px-2 py-1 rounded-md">
                    {dupLeads.length} duplicate{dupLeads.length !== 1 ? "s" : ""}
                  </span>
                )}
                {newLeads.length > 0 && (
                  <span className="bg-green-900/40 text-green-400 px-2 py-1 rounded-md">
                    {newLeads.length} new lead{newLeads.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
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
          <div className="space-y-3">
            {places.map((place, i) => {
              const alreadySaved = !isNew(place);
              return (
                <div
                  key={i}
                  className={`border rounded-xl p-5 transition-colors ${
                    alreadySaved
                      ? "bg-gray-900/40 border-gray-800/60 opacity-60"
                      : "bg-gray-900 border-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-semibold text-white truncate">
                          {place.name}
                        </h2>
                        {alreadySaved ? (
                          <span className="shrink-0 bg-yellow-900/50 text-yellow-500 text-xs px-2 py-0.5 rounded-full">
                            Already in DB
                          </span>
                        ) : (
                          <span className="shrink-0 bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full">
                            New
                          </span>
                        )}
                        {place.status === "OPERATIONAL" ? (
                          <span className="shrink-0 bg-green-900/30 text-green-500 text-xs px-2 py-0.5 rounded-full">
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
              );
            })}
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
