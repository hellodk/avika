"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { formatTs } from "@/lib/format-timestamp";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, MapPin, Building2, List, RefreshCw } from "lucide-react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const GEO_TOPOLOGY_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface GeoLocation {
  country: string;
  country_code: string;
  city: string;
  latitude: number;
  longitude: number;
  requests: number;
  errors: number;
  avg_latency: number;
}

interface CountryStat {
  country: string;
  country_code: string;
  requests: number;
  errors: number;
  bandwidth: number;
  error_rate: number;
}

interface CityStat {
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  requests: number;
}

interface GeoRequest {
  timestamp: number;
  client_ip: string;
  country: string;
  country_code: string;
  city: string;
  latitude: number;
  longitude: number;
  method: string;
  uri: string;
  status: number;
}

interface GeoData {
  locations: GeoLocation[];
  country_stats: CountryStat[];
  city_stats: CityStat[];
  recent_requests: GeoRequest[];
  total_countries: number;
  total_cities: number;
  total_requests: number;
  top_country_code: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export function GeoDashboard() {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [window_, setWindow] = useState("24h");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/geo?window=${window_}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Geo fetch error:", e);
      setData({
        locations: [],
        country_stats: [],
        city_stats: [],
        recent_requests: [],
        total_countries: 0,
        total_cities: 0,
        total_requests: 0,
        top_country_code: "",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [window_]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  const geo = data ?? {
    locations: [],
    country_stats: [],
    city_stats: [],
    recent_requests: [],
    total_countries: 0,
    total_cities: 0,
    total_requests: 0,
    top_country_code: "",
  };
  const topCountry = geo.country_stats?.find((c) => c.country_code === geo.top_country_code);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
            Geographic distribution
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "rgb(var(--theme-text-muted))" }}>
            Requests by country and city from access logs (X-Forwarded-For / client IP)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={window_} onValueChange={setWindow}>
            <SelectTrigger className="w-[140px]" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text))" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={fetchData}
            className="p-2 rounded-lg border hover:opacity-80"
            style={{ borderColor: "rgb(var(--theme-border))", color: "rgb(var(--theme-text-muted))" }}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
              <List className="h-4 w-4" />
              Total requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>
              {formatNumber(geo.total_requests)}
            </p>
          </CardContent>
        </Card>
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
              <Globe className="h-4 w-4" />
              Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>
              {geo.total_countries}
            </p>
          </CardContent>
        </Card>
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
              <Building2 className="h-4 w-4" />
              Cities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>
              {geo.total_cities}
            </p>
          </CardContent>
        </Card>
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "rgb(var(--theme-text-muted))" }}>
              <MapPin className="h-4 w-4" />
              Top country
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold truncate" style={{ color: "rgb(var(--theme-text))" }} title={topCountry?.country ?? "—"}>
              {topCountry?.country ?? "—"}
            </p>
            {topCountry && (
              <p className="text-xs mt-1" style={{ color: "rgb(var(--theme-text-muted))" }}>
                {formatNumber(topCountry.requests)} requests
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      {geo.locations && geo.locations.length > 0 && (
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader>
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Request locations</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>
              One marker per location (country/city) with requests in the selected window
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[380px] w-full rounded overflow-hidden border" style={{ borderColor: "rgb(var(--theme-border))" }}>
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 147 }}
                style={{ width: "100%", height: "100%" }}
              >
                <ZoomableGroup center={[20, 20]} zoom={0.8}>
                  <Geographies geography={GEO_TOPOLOGY_URL}>
                    {({ geographies }) =>
                      geographies.map((g) => (
                        <Geography
                          key={g.rsmKey}
                          geography={g}
                          fill="rgb(var(--theme-surface-light))"
                          stroke="rgb(var(--theme-border))"
                          strokeWidth={0.3}
                        />
                      ))
                    }
                  </Geographies>
                  {geo.locations
                    .filter((loc) => loc.latitude && loc.longitude)
                    .slice(0, 200)
                    .map((loc, i) => (
                      <Marker key={`${loc.country_code}-${loc.city}-${i}`} coordinates={[loc.longitude, loc.latitude]}>
                        <circle r={Math.min(2 + Math.log10(loc.requests + 1), 8)} fill="#3b82f6" fillOpacity={0.7} stroke="#1d4ed8" strokeWidth={0.5} />
                      </Marker>
                    ))}
                </ZoomableGroup>
              </ComposableMap>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Country stats */}
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader>
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>By country</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>Top 15 by request count</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                  <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Country</TableHead>
                  <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Code</TableHead>
                  <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Requests</TableHead>
                  <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Errors</TableHead>
                  <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Error %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(geo.country_stats ?? []).slice(0, 15).map((c, i) => (
                  <TableRow key={`${c.country_code}-${i}`} style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableCell style={{ color: "rgb(var(--theme-text))" }}>{c.country}</TableCell>
                    <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{c.country_code}</TableCell>
                    <TableCell className="text-right" style={{ color: "rgb(var(--theme-text))" }}>{formatNumber(c.requests)}</TableCell>
                    <TableCell className="text-right" style={{ color: "rgb(var(--theme-text))" }}>{formatNumber(c.errors)}</TableCell>
                    <TableCell className="text-right" style={{ color: "rgb(var(--theme-text))" }}>{c.error_rate?.toFixed(2) ?? "0"}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(!geo.country_stats || geo.country_stats.length === 0) && (
              <p className="py-6 text-center text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>No country data in this window</p>
            )}
          </CardContent>
        </Card>

        {/* City stats */}
        <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
          <CardHeader>
            <CardTitle style={{ color: "rgb(var(--theme-text))" }}>By city</CardTitle>
            <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>Top 15 by request count</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                  <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>City</TableHead>
                  <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Country</TableHead>
                  <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(geo.city_stats ?? []).slice(0, 15).map((c, i) => (
                  <TableRow key={`${c.city}-${c.country_code}-${i}`} style={{ borderColor: "rgb(var(--theme-border))" }}>
                    <TableCell style={{ color: "rgb(var(--theme-text))" }}>{c.city}</TableCell>
                    <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>{c.country}</TableCell>
                    <TableCell className="text-right" style={{ color: "rgb(var(--theme-text))" }}>{formatNumber(c.requests)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(!geo.city_stats || geo.city_stats.length === 0) && (
              <p className="py-6 text-center text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>No city data in this window</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent requests */}
      <Card style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
        <CardHeader>
          <CardTitle style={{ color: "rgb(var(--theme-text))" }}>Recent geo-located requests</CardTitle>
          <CardDescription style={{ color: "rgb(var(--theme-text-muted))" }}>Latest requests with location data</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: "rgb(var(--theme-border))" }}>
                <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Time</TableHead>
                <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Location</TableHead>
                <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>Method</TableHead>
                <TableHead style={{ color: "rgb(var(--theme-text-muted))" }}>URI</TableHead>
                <TableHead className="text-right" style={{ color: "rgb(var(--theme-text-muted))" }}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(geo.recent_requests ?? []).slice(0, 20).map((r, i) => (
                <TableRow key={`${r.client_ip}-${r.timestamp}-${i}`} style={{ borderColor: "rgb(var(--theme-border))" }}>
                  <TableCell style={{ color: "rgb(var(--theme-text-muted))" }}>
                    {r.timestamp ? formatTs(r.timestamp) : "—"}
                  </TableCell>
                  <TableCell style={{ color: "rgb(var(--theme-text))" }}>
                    {[r.city, r.country].filter(Boolean).join(", ") || r.country_code || "—"}
                  </TableCell>
                  <TableCell style={{ color: "rgb(var(--theme-text))" }}>{r.method || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate" style={{ color: "rgb(var(--theme-text))" }} title={r.uri}>{r.uri || "—"}</TableCell>
                  <TableCell className="text-right" style={{ color: "rgb(var(--theme-text))" }}>{r.status ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(!geo.recent_requests || geo.recent_requests.length === 0) && (
            <p className="py-6 text-center text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>No recent requests with location in this window</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
