import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { SkeletonCard } from '@/components/Skeleton';
import { getStats, getTrend, getCategoryBreakdown, getAllAlerts } from '@/api/admin';
import type { AdminStats } from '@/api/types';

const PIE_COLORS = ['#E11D3C', '#F59E0B', '#0D9488', '#0B1E45', '#D4AF37', '#2563EB'];

const CATEGORY_LABEL: Record<string, string> = {
  medical: 'Medical', accident: 'Accident', harassment: 'Harassment',
  violence: 'Violence', fire: 'Fire', theft: 'Theft',
  suspicious_activity: 'Suspicious Activity', other: 'Other',
};

export default function Analytics() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trend, setTrend] = useState<Array<{ day: string; c: number }>>([]);
  const [categories, setCategories] = useState<Array<{ category: string; c: number }>>([]);
  const [sourceSplit, setSourceSplit] = useState<Array<{ name: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), getTrend(), getCategoryBreakdown(), getAllAlerts()])
      .then(([s, t, c, alerts]) => {
        setStats(s);
        setTrend(t.map(r => ({ ...r, day: r.day.slice(5) })));
        setCategories(c.map(r => ({ ...r, category: CATEGORY_LABEL[r.category] || r.category })));
        const sos = alerts.filter(a => a.source === 'manual_sos').length;
        const reports = alerts.filter(a => a.source === 'citizen_report').length;
        const ai = alerts.filter(a => a.source === 'camera_ai').length;
        setSourceSplit([
          { name: 'Manual SOS', value: sos },
          { name: 'Citizen Report', value: reports },
          { name: 'Camera AI', value: ai },
        ].filter(s => s.value > 0));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <PageHeader title="Analytics" subtitle="Trends, distributions and response performance" />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Alerts" value={stats?.alerts.total ?? 0} tint="navy" sub="All time" />
          <StatCard label="SOS Alerts" value={stats?.alerts.sosTotal ?? 0} tint="crimson" />
          <StatCard label="Citizen Reports" value={stats?.alerts.reportsTotal ?? 0} tint="amber" />
          <StatCard label="Completed Today" value={stats?.alerts.completedToday ?? 0} tint="teal" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* 14-day trend */}
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <h3 className="font-display font-semibold text-sm text-[#0F172A] mb-4">Alerts — Last 14 Days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0B1E45" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0B1E45" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
              <Area type="monotone" dataKey="c" name="Alerts" stroke="#0B1E45" fill="url(#aFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <h3 className="font-display font-semibold text-sm text-[#0F172A] mb-4">Alerts by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categories} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: '#64748B' }} width={100} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
              <Bar dataKey="c" name="Count" fill="#E11D3C" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Source distribution */}
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <h3 className="font-display font-semibold text-sm text-[#0F172A] mb-4">Alert Sources</h3>
          {sourceSplit.length === 0 ? (
            <p className="text-sm text-[#94A3B8] text-center py-10">No alerts yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceSplit} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={(props) => `${props.name ?? ''} ${(((props.percent) ?? 0) * 100).toFixed(0)}%`} labelLine fontSize={11}>
                  {sourceSplit.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Personnel overview */}
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <h3 className="font-display font-semibold text-sm text-[#0F172A] mb-4">Network Coverage</h3>
          {!stats ? null : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[
                { name: 'Total Users', value: stats.users.total },
                { name: 'Helpers', value: stats.users.helpers },
                { name: 'Authorities', value: stats.users.authorities },
                { name: 'Admins', value: stats.users.admins },
                { name: 'Cameras', value: stats.cameras.total },
                { name: 'Missing Cases', value: stats.missingPersons.active },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                <Bar dataKey="value" fill="#0B1E45" radius={[4, 4, 0, 0]}>
                  {[...Array(6)].map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Layout>
  );
}
