"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTs } from "@/lib/format-timestamp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Users, Globe, Activity, Bot, Monitor, Smartphone, Tablet } from "lucide-react";

interface VisitorAnalytics {
  summary: {
    unique_visitors: string;
    total_hits: string;
    total_bandwidth: string;
    bot_hits: string;
    human_hits: string;
  };
  browsers: Array<{
    browser: string;
    version: string;
    hits: string;
    visitors: string;
    percentage: number;
  }>;
  operating_systems: Array<{
    os: string;
    version: string;
    hits: string;
    visitors: string;
    percentage: number;
  }>;
  referrers: Array<{
    referrer: string;
    hits: string;
    visitors: string;
    percentage: number;
  }>;
  not_found: Array<{
    path: string;
    hits: string;
    last_seen: string;
  }>;
  hourly: Array<{
    hour: number;
    hits: string;
    visitors: string;
    bandwidth: string;
  }>;
  devices: {
    desktop: string;
    mobile: string;
    tablet: string;
    other: string;
  };
  static_files: Array<{
    path: string;
    hits: string;
    bandwidth: string;
  }>;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function formatNumber(num: string | number): string {
  const n = typeof num === "string" ? parseInt(num) : num;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatBytes(bytes: string | number): string {
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(2) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(2) + " KB";
  return b + " B";
}

export default function VisitorsPage() {
  const [data, setData] = useState<VisitorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState("24h");

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/visitor-analytics?timeWindow=${timeWindow}`);
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.error("Failed to fetch visitor analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [timeWindow]);

  const deviceData = data?.devices
    ? [
      { name: "Desktop", value: parseInt(data.devices.desktop || "0"), icon: Monitor },
      { name: "Mobile", value: parseInt(data.devices.mobile || "0"), icon: Smartphone },
      { name: "Tablet", value: parseInt(data.devices.tablet || "0"), icon: Tablet },
      { name: "Other", value: parseInt(data.devices.other || "0"), icon: Globe },
    ].filter((d) => d.value > 0)
    : [];

  const trafficTypeData = data?.summary
    ? [
      { name: "Human", value: parseInt(data.summary.human_hits || "0") },
      { name: "Bot", value: parseInt(data.summary.bot_hits || "0") },
    ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visitor Analytics</h1>
        </div>
        <Select value={timeWindow} onValueChange={setTimeWindow}>
          <SelectTrigger className="w-[180px] px-3 py-2 border rounded-md bg-background">
            <SelectValue placeholder="Time window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last Hour</SelectItem>
            <SelectItem value="24h">Last 24 Hours</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(data?.summary?.unique_visitors || "0")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hits</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(data?.summary?.total_hits || "0")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {formatBytes(data?.summary?.total_bandwidth || "0")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Traffic</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {data?.summary?.total_hits
                  ? (
                    (parseInt(data.summary.bot_hits || "0") /
                      parseInt(data.summary.total_hits)) *
                    100
                  ).toFixed(1)
                  : "0"}
                %
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="browsers">Browsers</TabsTrigger>
          <TabsTrigger value="os">Operating Systems</TabsTrigger>
          <TabsTrigger value="referrers">Referrers</TabsTrigger>
          <TabsTrigger value="404">404 Errors</TabsTrigger>
          <TabsTrigger value="static">Static Files</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Hourly Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Hourly Traffic Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px]" />
                ) : (
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <AreaChart data={data?.hourly || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: any) => formatNumber(value)}
                        labelFormatter={(h) => `${h}:00`}
                      />
                      <Area
                        type="monotone"
                        dataKey="hits"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                        name="Hits"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Device Types */}
            <Card>
              <CardHeader>
                <CardTitle>Device Types</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px]" />
                ) : (
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <PieChart>
                      <Pie
                        data={deviceData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {deviceData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatNumber(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Traffic Type */}
            <Card>
              <CardHeader>
                <CardTitle>Human vs Bot Traffic</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px]" />
                ) : (
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <PieChart>
                      <Pie
                        data={trafficTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip formatter={(value: any) => formatNumber(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Browsers */}
            <Card>
              <CardHeader>
                <CardTitle>Top Browsers</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px]" />
                ) : (
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <BarChart
                      data={(data?.browsers || []).slice(0, 5)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        dataKey="browser"
                        type="category"
                        width={100}
                      />
                      <Tooltip formatter={(value: any) => formatNumber(value)} />
                      <Bar dataKey="hits" fill="#3b82f6" name="Hits" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="browsers">
          <Card>
            <CardHeader>
              <CardTitle>Browser Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Browser</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Visitors</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.browsers || []).map((browser, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{browser.browser}</TableCell>
                      <TableCell>{browser.version}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(browser.hits)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(browser.visitors)}
                      </TableCell>
                      <TableCell className="text-right">
                        {browser.percentage?.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="os">
          <Card>
            <CardHeader>
              <CardTitle>Operating System Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Visitors</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.operating_systems || []).map((os, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{os.os}</TableCell>
                      <TableCell>{os.version}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(os.hits)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(os.visitors)}
                      </TableCell>
                      <TableCell className="text-right">
                        {os.percentage?.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrers">
          <Card>
            <CardHeader>
              <CardTitle>Referring Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Visitors</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.referrers || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No referrer data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.referrers || []).map((referrer, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{referrer.referrer}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(referrer.hits)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(referrer.visitors)}
                        </TableCell>
                        <TableCell className="text-right">
                          {referrer.percentage?.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="404">
          <Card>
            <CardHeader>
              <CardTitle>404 Not Found Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.not_found || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No 404 errors recorded
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.not_found || []).map((nf, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">{nf.path}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(nf.hits)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatTs(nf.last_seen)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="static">
          <Card>
            <CardHeader>
              <CardTitle>Static Files</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Bandwidth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.static_files || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No static file data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.static_files || []).map((sf, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">{sf.path}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(sf.hits)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatBytes(sf.bandwidth)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
