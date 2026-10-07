import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import { getAllCameras } from '@/api/admin';
import type { AdminCamera } from '@/api/types';
import 'leaflet/dist/leaflet.css';

// Mirrors the mobile app's aiStatusFor() logic (see mobile/app/(app)/cameras.tsx)
// so an admin and a camera owner never see contradictory statuses.
function aiStatus(c: AdminCamera): { label: string; className: string } {
  if (!c.stream_url) return { label: 'No stream configured', className: 'text-[#94A3B8]' };
  if (!c.ai_last_seen_at) return { label: 'Stream set, not yet connected', className: 'text-[#94A3B8]' };
  const ageMs = Date.now() - new Date(c.ai_last_seen_at).getTime();
  if (ageMs < 2 * 60 * 1000) return { label: `Active · ${new Date(c.ai_last_seen_at).toLocaleTimeString()}`, className: 'text-teal font-semibold' };
  return { label: `Offline · last seen ${new Date(c.ai_last_seen_at).toLocaleString()}`, className: 'text-amber font-semibold' };
}

export default function Cameras() {
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllCameras().then(setCameras).finally(() => setLoading(false));
  }, []);

  const geoCameras = cameras.filter((c) => c.lat && c.lng);
  const activeAiCount = cameras.filter((c) => c.ai_last_seen_at && Date.now() - new Date(c.ai_last_seen_at).getTime() < 2 * 60 * 1000).length;

  return (
    <Layout>
      <PageHeader
        title="CCTV Camera Registry"
        subtitle={`${cameras.length} registered · ${activeAiCount} with the AI service actively monitoring right now`}
      />

      {!loading && geoCameras.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/5 p-5 mb-6">
          <div style={{ height: 340 }}>
            <MapContainer center={[geoCameras[0].lat!, geoCameras[0].lng!]} zoom={11} style={{ height: '100%', width: '100%' }}>
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {geoCameras.map((c) => (
                <Marker key={c.id} position={[c.lat!, c.lng!]}>
                  <Popup>
                    <strong>{c.name}</strong><br />{c.address}<br />
                    <span className="capitalize">{c.placement}</span> · {c.status}<br />
                    {aiStatus(c).label}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-[#94A3B8] text-sm">Loading…</div>
      ) : cameras.length === 0 ? (
        <p className="text-sm text-[#94A3B8]">No cameras registered yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Address</th>
                <th className="px-5 py-3 font-medium">Placement</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">AI Service</th>
                <th className="px-5 py-3 font-medium">Registered</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((c) => {
                const ai = aiStatus(c);
                return (
                  <tr key={c.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-3 font-medium text-[#0F172A]">{c.name}</td>
                    <td className="px-5 py-3 text-[#64748B]">{c.address || '—'}</td>
                    <td className="px-5 py-3 capitalize text-[#334155]">{c.placement}</td>
                    <td className="px-5 py-3"><Badge status={c.status} /></td>
                    <td className={`px-5 py-3 text-xs ${ai.className}`}>{ai.label}</td>
                    <td className="px-5 py-3 text-[#94A3B8]">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
