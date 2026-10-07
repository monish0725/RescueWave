import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Layout from '@/components/Layout';
import HeatmapLayer from '@/components/HeatmapLayer';
import { SkeletonCard } from '@/components/Skeleton';
import Badge from '@/components/Badge';
import { getStats, getTrend, getAllAlerts, getHelperApplications, getAuthorityApplications } from '@/api/admin';
import type { AdminStats, AdminAlert } from '@/api/types';
import 'leaflet/dist/leaflet.css';

function CommandStat({ label, value, sub, color, icon }: { label: string; value: number | string; sub?: string; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${color}`}>{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
        <p className="font-display font-bold text-2xl text-[#0F172A] mt-0.5">{value}</p>
        {sub && <p className="text-xs text-[#64748B] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ActivityRow({ alert }: { alert: AdminAlert }) {
  const labels: Record<string, string> = { manual_sos: '🚨 SOS', citizen_report: '📋 Report', camera_ai: '📷 Camera AI' };
  const cat = alert.category?.replace('_', ' ') || '';
  return (
    <div className="flex items-start gap-3 py-3 border-b border-black/5 last:border-0">
      <div className="w-2 h-2 rounded-full bg-crimson mt-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#0F172A] truncate">{labels[alert.source] || alert.source}{cat ? ` · ${cat}` : ''}</p>
        <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{alert.description || alert.address || 'No description'}</p>
        <p className="text-xs text-[#CBD5E1] mt-0.5">{new Date(alert.created_at).toLocaleString()}</p>
      </div>
      <Badge status={alert.status} />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trend, setTrend] = useState<Array<{ day: string; c: number }>>([]);
  const [recentAlerts, setRecentAlerts] = useState<AdminAlert[]>([]);
  const [heatPoints, setHeatPoints] = useState<Array<[number, number, number]>>([]);
  const [pendingHelpers, setPendingHelpers] = useState(0);
  const [pendingAuthorities, setPendingAuthorities] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const [s, t, alerts, hApps, aApps] = await Promise.all([
        getStats(), getTrend(), getAllAlerts(), getHelperApplications('pending'), getAuthorityApplications('pending'),
      ]);
      setStats(s);
      setTrend(t.map(r => ({ ...r, day: r.day.slice(5) })));
      setRecentAlerts(alerts.slice(0, 10));
      setHeatPoints(alerts.filter(a => a.lat && a.lng).map(a => [a.lat as number, a.lng as number, a.source === 'manual_sos' ? 1 : 0.6]));
      setPendingHelpers(hApps.length);
      setPendingAuthorities(aApps.length);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#0F172A]">Emergency Command Center</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Live overview · auto-refreshes every 30s</p>
        </div>
        {(pendingHelpers + pendingAuthorities) > 0 && (
          <Link to="/helpers" className="flex items-center gap-2 bg-amber-mist text-amber border border-amber/30 px-4 py-2 rounded-xl text-sm font-semibold">
            ⚠ {pendingHelpers + pendingAuthorities} pending application{pendingHelpers + pendingAuthorities !== 1 ? 's' : ''}
          </Link>
        )}
      </div>

      {/* Command stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {loading ? (
          [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <CommandStat label="Open Alerts" value={stats?.alerts.open ?? 0} sub={`${stats?.alerts.assigned ?? 0} assigned`} color="bg-crimson-mist" icon="🚨" />
            <CommandStat label="Active Missing" value={stats?.missingPersons.active ?? 0} sub={`${stats?.missingPersons.found ?? 0} found`} color="bg-amber-mist" icon="🔍" />
            <CommandStat label="Helpers" value={stats?.users.helpers ?? 0} color="bg-teal-mist" icon="🤝" />
            <CommandStat label="Authorities" value={stats?.users.authorities ?? 0} color="bg-navy-mist" icon="🛡️" />
            <CommandStat label="Cameras" value={stats?.cameras.active ?? 0} sub={`${stats?.cameras.total ?? 0} registered`} color="bg-gold-mist" icon="📷" />
            <CommandStat label="Users" value={stats?.users.total ?? 0} color="bg-blue-mist" icon="👥" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Trend chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-black/5 p-5">
          <h3 className="font-display font-semibold text-sm text-[#0F172A] mb-4">Alert Activity — Last 14 Days</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E11D3C" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#E11D3C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #f1f5f9' }} />
              <Area type="monotone" dataKey="c" name="Alerts" stroke="#E11D3C" fill="url(#dashFill)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl border border-black/5 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm text-[#0F172A]">Recent Alerts</h3>
            <Link to="/alerts" className="text-xs font-semibold text-navy">View all →</Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            {recentAlerts.length === 0
              ? <p className="text-xs text-[#94A3B8] text-center py-8">No alerts yet.</p>
              : recentAlerts.map(a => <ActivityRow key={a.id} alert={a} />)
            }
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-sm text-[#0F172A]">Alert Location Heatmap</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Hotter areas indicate higher alert frequency from real geo-tagged alerts and reports.</p>
          </div>
          <span className="text-xs font-semibold text-[#94A3B8] bg-[#F8FAFC] px-2.5 py-1 rounded-lg">{heatPoints.length} geo-tagged alert{heatPoints.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ height: 400 }}>
          <MapContainer center={[20.5937, 78.9629]} zoom={heatPoints.length ? 11 : 4} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}
          </MapContainer>
        </div>
        {heatPoints.length === 0 && <p className="text-xs text-[#94A3B8] mt-3 text-center">No geo-tagged alerts yet — data will appear once alerts with location information are created.</p>}
      </div>
    </Layout>
  );
}
