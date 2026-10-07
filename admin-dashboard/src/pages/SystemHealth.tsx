import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import api, { API_URL } from '@/api/client';
import { getAllCameras } from '@/api/admin';
import type { AdminCamera } from '@/api/types';

interface HealthState {
  ok: boolean;
  time?: string;
  latencyMs?: number;
  error?: string;
}

export default function SystemHealth() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checking, setChecking] = useState(true);
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [camerasError, setCamerasError] = useState(false);

  async function check() {
    setChecking(true);
    const start = performance.now();
    try {
      const { data } = await api.get('/health');
      setHealth({ ok: data.ok, time: data.time, latencyMs: Math.round(performance.now() - start) });
    } catch (err) {
      setHealth({ ok: false, error: err instanceof Error ? err.message : 'Unreachable' });
    } finally {
      setChecking(false);
    }
  }

  function loadCameras() {
    getAllCameras()
      .then((c) => { setCameras(c); setCamerasError(false); })
      .catch(() => setCamerasError(true)); // was a silent no-op — a fetch failure showed as "0 cameras" indistinguishably from actually having none
  }

  useEffect(() => {
    check();
    loadCameras();
    const interval = setInterval(() => {
      check();
      loadCameras();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeAiCameras = cameras.filter((c) => c.ai_last_seen_at && Date.now() - new Date(c.ai_last_seen_at).getTime() < 2 * 60 * 1000);
  const configuredCameras = cameras.filter((c) => c.stream_url);

  return (
    <Layout>
      <PageHeader title="System Health" subtitle="Backend connectivity and module status" />

      <div className="bg-white rounded-2xl border border-black/5 p-5 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${health?.ok ? 'bg-teal' : 'bg-crimson'} ${checking ? 'animate-pulse' : ''}`} />
            <div>
              <div className="font-display font-semibold text-sm text-[#0F172A]">Backend API</div>
              <div className="text-xs text-[#64748B]">{API_URL}</div>
            </div>
          </div>
          <button onClick={check} className="text-xs font-semibold text-navy">Refresh</button>
        </div>
        {health?.ok ? (
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-[#94A3B8] text-xs block">Status</span>Healthy</div>
            <div><span className="text-[#94A3B8] text-xs block">Response time</span>{health.latencyMs} ms</div>
            <div><span className="text-[#94A3B8] text-xs block">Server time</span>{health.time ? new Date(health.time).toLocaleString() : '—'}</div>
          </div>
        ) : health && !health.ok ? (
          <p className="mt-4 text-sm text-crimson">Unreachable: {health.error}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ModuleStatus name="Mobile App API" description="Auth, contacts sync, alerts, helpers, authorities, cameras, missing persons" active />
        <ModuleStatus name="Push Notifications" description="Real-time Expo push to Helpers, Authorities and reporters" active />
        <ModuleStatus name="Live Location Sharing" description="Background tracking for missions and emergency-contact shares" active />
        <ModuleStatus
          name="AI CCTV Detection"
          description={
            camerasError
              ? "Couldn't load camera list to check — this card's status may be stale (see the error above)"
              : configuredCameras.length === 0
              ? 'Gesture/voice/face-matching camera service — no camera has a stream configured yet (see Cameras)'
              : `${activeAiCameras.length} of ${configuredCameras.length} configured camera(s) actively sending frames right now`
          }
          active={activeAiCameras.length > 0}
        />
        <ModuleStatus
          name="Missing-Person Face Matching"
          description={
            camerasError
              ? "Couldn't load camera list to check — this card's status may be stale"
              : "InsightFace (SCRFD detection + ArcFace embeddings) against active missing-person photos, run by the same AI service"
          }
          active={activeAiCameras.length > 0}
        />
      </div>
    </Layout>
  );
}

function ModuleStatus({ name, description, active }: { name: string; description: string; active: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 flex items-start gap-3">
      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${active ? 'bg-teal' : 'bg-[#CBD5E1]'}`} />
      <div>
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-sm text-[#0F172A]">{name}</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${active ? 'bg-teal-mist text-teal' : 'bg-black/5 text-[#64748B]'}`}>
            {active ? 'Active' : 'Not connected'}
          </span>
        </div>
        <p className="text-xs text-[#64748B] mt-1">{description}</p>
      </div>
    </div>
  );
}
