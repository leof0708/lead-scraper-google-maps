"use client";

import { useState, useEffect, useRef } from "react";
import { Place } from "./api/search/route";
import { Cell } from "./api/areas/route";

// ── Constants ────────────────────────────────────────────────────────────────
const DB_KEY = "leads_db_v1";
const USAGE_KEY = "api_usage_v1";
const FREE_LIMIT = 5000;
const WARN_AT = 4000;

// ── localStorage helpers ─────────────────────────────────────────────────────
function loadDb(): Set<string> {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveDb(db: Set<string>) {
  localStorage.setItem(DB_KEY, JSON.stringify([...db]));
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function loadUsage(): number {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const { month, calls } = JSON.parse(raw);
    return month === currentMonth() ? (calls as number) : 0;
  } catch { return 0; }
}
function saveUsage(calls: number) {
  localStorage.setItem(USAGE_KEY, JSON.stringify({ month: currentMonth(), calls }));
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span className="text-amber-400 text-sm tracking-tight">
      {"★".repeat(full)}{half ? "½" : ""}{"☆".repeat(5 - full - (half ? 1 : 0))}
      <span className="text-[#5a3a3a] ml-1.5 text-xs">{rating.toFixed(1)}</span>
    </span>
  );
}

function UsageBar({ used }: { used: number }) {
  const pct = Math.min((used / FREE_LIMIT) * 100, 100);
  const color = used >= FREE_LIMIT ? "bg-red-500" : used >= WARN_AT ? "bg-amber-500" : "bg-red-800";
  return (
    <div className="w-full bg-[#1e0808] rounded-full h-1.5 mt-2">
      <div className={`${color} h-1.5 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Badge({ children, variant }: { children: React.ReactNode; variant: "new" | "dup" | "open" | "status" }) {
  const styles = {
    new: "bg-emerald-950/70 text-emerald-400 border border-emerald-900/50",
    dup: "bg-[#2d1a00]/70 text-amber-600 border border-amber-900/30",
    open: "bg-emerald-950/50 text-emerald-500/80 border border-emerald-900/30",
    status: "bg-[#1a0a0a] text-[#7a5050] border border-[#2d1212]",
  };
  return (
    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full bg-[#1e0808] rounded-full h-1.5">
      <div
        className="bg-red-800 h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [maxLeads, setMaxLeads] = useState<number | "">(20);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [totalApiCalls, setTotalApiCalls] = useState(0);
  const [db, setDb] = useState<Set<string>>(new Set());
  const [dbCount, setDbCount] = useState(0);
  const [exportNewOnly, setExportNewOnly] = useState(true);
  const [monthlyUsed, setMonthlyUsed] = useState(0);

  // Multi-area progress
  const [phase, setPhase] = useState("");
  const [areaProgress, setAreaProgress] = useState<{ current: number; total: number } | null>(null);

  // Abort ref so we can cancel mid-search
  const abortRef = useRef(false);

  useEffect(() => {
    const loaded = loadDb();
    setDb(loaded);
    setDbCount(loaded.size);
    setMonthlyUsed(loadUsage());
  }, []);

  const remaining = FREE_LIMIT - monthlyUsed;
  const limitReached = monthlyUsed >= FREE_LIMIT;
  const nearLimit = monthlyUsed >= WARN_AT && !limitReached;

  function isNew(place: Place) { return !db.has(place.id); }
  const newLeads = places.filter(isNew);
  const dupLeads = places.filter((p) => !isNew(p));

  // ── Single-area search (≤ 60 leads) ────────────────────────────────────────
  async function searchSingleArea(
    target: number,
    usageRef: { calls: number }
  ): Promise<Place[]> {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessType, location, maxLeads: target }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Search failed");
    usageRef.calls += data.apiCallsMade;
    return data.places as Place[];
  }

  // ── Multi-area search (> 60 leads) ─────────────────────────────────────────
  async function searchMultiArea(
    target: number,
    usageRef: { calls: number }
  ): Promise<Place[]> {
    setPhase("Getting city areas…");
    const areasRes = await fetch("/api/areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, maxLeads: target }),
    });
    const areasData = await areasRes.json();
    if (!areasRes.ok) throw new Error(areasData.error ?? "Could not get city areas");

    const cells: Cell[] = areasData.cells;
    const seen = new Set<string>();
    const accumulated: Place[] = [];

    setAreaProgress({ current: 0, total: cells.length });

    for (let i = 0; i < cells.length; i++) {
      if (abortRef.current) break;
      if (accumulated.length >= target) break;

      setPhase(`Searching area ${i + 1} of ${cells.length}…`);
      setAreaProgress({ current: i + 1, total: cells.length });

      const needed = target - accumulated.length;
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType,
          location,
          maxLeads: Math.min(needed, 60),
          locationBox: cells[i],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Search failed on area ${i + 1}`);

      usageRef.calls += data.apiCallsMade;

      // Deduplicate across areas
      for (const p of data.places as Place[]) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          accumulated.push(p);
        }
      }

      // Stream results into UI progressively
      setPlaces([...accumulated]);
    }

    return accumulated;
  }

  // ── Main handler ───────────────────────────────────────────────────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!businessType.trim() || !location.trim() || limitReached) return;

    const target = maxLeads || 20;
    const estimatedCalls = target <= 60
      ? Math.ceil(target / 20)
      : Math.ceil(target / 20) + 1; // +1 for the areas call

    if (estimatedCalls > remaining) {
      setError(`This search needs ~${estimatedCalls} API calls but you only have ${remaining} left this month.`);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setError("");
    setPlaces([]);
    setSearched(false);
    setTotalApiCalls(0);
    setAreaProgress(null);
    setPhase("");

    const usageRef = { calls: 0 };

    try {
      let results: Place[];

      if (target <= 60) {
        setPhase("Searching…");
        results = await searchSingleArea(target, usageRef);
      } else {
        results = await searchMultiArea(target, usageRef);
      }

      setPlaces(results);
      setTotalApiCalls(usageRef.calls);
      setSearched(true);

      const newTotal = monthlyUsed + usageRef.calls;
      saveUsage(newTotal);
      setMonthlyUsed(newTotal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setPhase("");
      setAreaProgress(null);
    }
  }

  function handleCancel() {
    abortRef.current = true;
    setLoading(false);
    setPhase("");
    setAreaProgress(null);
    setSearched(true);
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

  const inputClass =
    "w-full bg-[#130707] border border-[#2d1212] rounded-lg px-4 py-3 text-[#f0e0e0] placeholder-[#5a3535] focus:outline-none focus:ring-2 focus:ring-red-900 focus:border-red-800 transition-colors";

  return (
    <main
      className="min-h-screen text-[#f0e8e8]"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, #2a0808 0%, #0a0404 60%)" }}
    >
      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-10 gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-[#3d1515] flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Lead Scraper</h1>
            </div>
            <p className="text-[#7a5050] text-sm ml-[52px]">Extract business leads from Google Maps</p>
          </div>

          {/* Stats */}
          <div className="flex gap-3">
            <div className={`bg-[#130707] border rounded-xl px-5 py-3 text-right min-w-[170px] ${
              limitReached ? "border-red-700" : nearLimit ? "border-amber-800" : "border-[#2d1212]"
            }`}>
              <div className="text-xs text-[#5a3535] mb-0.5 uppercase tracking-wide">API calls / month</div>
              <div className={`text-2xl font-bold tabular-nums ${limitReached ? "text-red-400" : nearLimit ? "text-amber-400" : "text-white"}`}>
                {monthlyUsed.toLocaleString()}
                <span className="text-sm font-normal text-[#3d1818]"> / {FREE_LIMIT.toLocaleString()}</span>
              </div>
              <UsageBar used={monthlyUsed} />
              <div className="text-xs text-[#5a3535] mt-1.5">
                {limitReached ? "Resets 1st of next month" : `${remaining.toLocaleString()} remaining`}
              </div>
            </div>
            <div className="bg-[#130707] border border-[#2d1212] rounded-xl px-5 py-3 text-right min-w-[130px]">
              <div className="text-xs text-[#5a3535] mb-0.5 uppercase tracking-wide">Leads saved</div>
              <div className="text-2xl font-bold text-white tabular-nums">{dbCount.toLocaleString()}</div>
              {dbCount > 0 && (
                <button onClick={handleClearDb} className="text-xs text-[#7a3535] hover:text-red-400 mt-1.5 transition-colors">
                  Clear DB
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Banners ── */}
        {limitReached && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm flex items-center gap-3">
            <span className="text-red-500 text-lg">⊘</span>
            Monthly free limit of 5,000 API calls reached. Searches are blocked until the 1st of next month.
          </div>
        )}
        {nearLimit && (
          <div className="bg-amber-950/30 border border-amber-800/50 text-amber-300 rounded-xl px-5 py-4 mb-6 text-sm flex items-center gap-3">
            <span className="text-amber-500 text-lg">⚠</span>
            {remaining} API calls remaining this month. Use them wisely.
          </div>
        )}

        {/* ── Search Form ── */}
        <div className="bg-[#130707] border border-[#2d1212] rounded-2xl p-6 mb-6 shadow-2xl">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-[#7a5050] uppercase tracking-wider mb-2">
                  Type of Business
                </label>
                <input type="text" value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="e.g. plumber, dentist, gym" className={inputClass} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7a5050] uppercase tracking-wider mb-2">
                  City, Country
                </label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Paris, France" className={inputClass} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7a5050] uppercase tracking-wider mb-2">
                  Number of Leads
                  {maxLeads && Number(maxLeads) > 0 && (
                    <span className={`ml-2 normal-case font-normal ${
                      Math.ceil(Number(maxLeads) / 20) > remaining ? "text-red-500" : "text-[#5a3535]"
                    }`}>
                      — ≈ {Math.ceil(Number(maxLeads) / 20)} API call{Math.ceil(Number(maxLeads) / 20) !== 1 ? "s" : ""}
                      {Number(maxLeads) > 60 && (
                        <span className="text-red-700/80">
                          {" "}· splits into {
                            Number(maxLeads) <= 240 ? "4" : Number(maxLeads) <= 540 ? "9" : "16"
                          } areas
                        </span>
                      )}
                    </span>
                  )}
                </label>
                <input type="number" min={1} max={960} value={maxLeads}
                  onChange={(e) => setMaxLeads(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 200" className={inputClass} required />
              </div>
            </div>

            {/* Action row */}
            <div className="flex flex-wrap items-center gap-3">
              {loading ? (
                <button type="button" onClick={handleCancel}
                  className="bg-[#2d1212] hover:bg-[#3d1515] text-red-400 font-semibold px-7 py-2.5 rounded-lg transition-all text-sm border border-red-900/40">
                  Cancel
                </button>
              ) : (
                <button type="submit" disabled={limitReached}
                  className="bg-red-900 hover:bg-red-800 disabled:bg-[#1e0808] disabled:text-[#5a3535] disabled:cursor-not-allowed text-white font-semibold px-7 py-2.5 rounded-lg transition-all duration-200 text-sm border border-red-800/50 hover:border-red-700 disabled:border-[#2d1212] shadow-lg shadow-red-950/50">
                  {limitReached ? "Limit Reached" : "Search"}
                </button>
              )}

              {places.length > 0 && !loading && (
                <>
                  <div className="w-px h-7 bg-[#2d1212]" />
                  <button type="button" onClick={() => handleExport("csv")}
                    className="bg-[#1a0a0a] hover:bg-[#220d0d] text-[#c0a0a0] hover:text-white font-medium px-4 py-2.5 rounded-lg transition-all text-sm border border-[#2d1212] hover:border-[#4d2020]">
                    Export CSV
                  </button>
                  <button type="button" onClick={() => handleExport("xlsx")}
                    className="bg-[#1a0a0a] hover:bg-[#220d0d] text-[#c0a0a0] hover:text-white font-medium px-4 py-2.5 rounded-lg transition-all text-sm border border-[#2d1212] hover:border-[#4d2020]">
                    Export Excel
                  </button>
                  {newLeads.length > 0 && (
                    <button type="button" onClick={handleSaveToDb}
                      className="bg-red-900/40 hover:bg-red-900/70 text-red-300 hover:text-white font-medium px-4 py-2.5 rounded-lg transition-all text-sm border border-red-900/50 hover:border-red-700">
                      Save {newLeads.length} new to DB
                    </button>
                  )}
                  <label className="flex items-center gap-2 text-sm text-[#7a5050] cursor-pointer select-none ml-1">
                    <input type="checkbox" checked={exportNewOnly} onChange={(e) => setExportNewOnly(e.target.checked)}
                      className="accent-red-800 w-3.5 h-3.5" />
                    New leads only
                  </label>
                </>
              )}

              {(searched || loading) && (
                <div className="ml-auto flex items-center gap-2 text-xs">
                  {totalApiCalls > 0 && !loading && (
                    <span className="text-[#5a3535]">{totalApiCalls} call{totalApiCalls !== 1 ? "s" : ""} used</span>
                  )}
                  {places.length > 0 && (
                    <span className="text-[#5a3535]">{places.length} found</span>
                  )}
                  {!loading && dupLeads.length > 0 && (
                    <span className="bg-[#2d1a00]/60 text-amber-600 px-2.5 py-1 rounded-md border border-amber-900/30">
                      {dupLeads.length} duplicate{dupLeads.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {!loading && newLeads.length > 0 && (
                    <span className="bg-emerald-950/60 text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-900/40">
                      {newLeads.length} new
                    </span>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* ── Progress indicator ── */}
        {loading && (
          <div className="bg-[#130707] border border-[#2d1212] rounded-xl px-5 py-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#c0a0a0] flex items-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin text-red-700" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                {phase}
              </span>
              {areaProgress && (
                <span className="text-xs text-[#5a3535]">
                  {areaProgress.current} / {areaProgress.total} areas
                </span>
              )}
            </div>
            {areaProgress && (
              <ProgressBar current={areaProgress.current} total={areaProgress.total} />
            )}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/60 text-red-300 rounded-xl px-5 py-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {places.length > 0 && (
          <div className="space-y-2.5">
            {places.map((place, i) => {
              const alreadySaved = !isNew(place);
              return (
                <div key={i} className={`border rounded-xl p-5 transition-all duration-200 ${
                  alreadySaved
                    ? "bg-[#0e0505] border-[#1e0c0c] opacity-50 hover:opacity-70"
                    : "bg-[#130707] border-[#2d1212] hover:border-[#4d2020] hover:bg-[#160909]"
                }`}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h2 className="text-base font-semibold text-white truncate">{place.name}</h2>
                        <Badge variant={alreadySaved ? "dup" : "new"}>{alreadySaved ? "In DB" : "New"}</Badge>
                        {place.status === "OPERATIONAL" && <Badge variant="open">Open</Badge>}
                        {place.status && place.status !== "OPERATIONAL" && (
                          <Badge variant="status">{place.status.replace(/_/g, " ")}</Badge>
                        )}
                      </div>
                      {place.rating && (
                        <div className="mb-3">
                          <StarRating rating={place.rating} />
                          {place.reviewCount && (
                            <span className="text-[#5a3a3a] text-xs ml-1">({place.reviewCount.toLocaleString()} reviews)</span>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        {place.address && (
                          <div className="flex gap-2">
                            <svg className="w-3.5 h-3.5 text-[#4a2020] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-[#9d7070]">{place.address}</span>
                          </div>
                        )}
                        {place.phone && (
                          <div className="flex gap-2">
                            <svg className="w-3.5 h-3.5 text-[#4a2020] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <a href={`tel:${place.phone}`} className="text-red-400/80 hover:text-red-300 transition-colors">{place.phone}</a>
                          </div>
                        )}
                        {place.website && (
                          <div className="flex gap-2 sm:col-span-2">
                            <svg className="w-3.5 h-3.5 text-[#4a2020] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                            </svg>
                            <a href={place.website} target="_blank" rel="noopener noreferrer"
                              className="text-red-400/80 hover:text-red-300 transition-colors truncate max-w-sm">
                              {place.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                    <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 bg-[#1a0808] hover:bg-[#220d0d] text-[#9d6060] hover:text-red-300 text-xs font-medium px-4 py-2 rounded-lg transition-all border border-[#2d1212] hover:border-[#4d2020] whitespace-nowrap flex items-center gap-1.5 self-start">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Maps
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && searched && places.length === 0 && (
          <div className="text-center py-20">
            <div className="text-[#3d1818] text-5xl mb-4">◎</div>
            <p className="text-[#5a3535]">No results found. Try a different business type or location.</p>
          </div>
        )}
      </div>
    </main>
  );
}
