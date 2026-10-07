import React, { useEffect, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { getAllCameras } from '@/api/admin';
import api from '@/api/client';
import type { AdminCamera } from '@/api/types';

interface HealthState { ok: boolean; latencyMs?: number; time?: string; error?: string; }

function parseBackendDate(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

function Indicator({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-teal' : 'bg-[#CBD5E1]'} ${active ? 'animate-pulse' : ''}`} />
      <span className={`text-xs font-medium ${active ? 'text-teal' : 'text-[#94A3B8]'}`}>{label}</span>
    </div>
  );
}

export default function AIMonitoring() {
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [camerasError, setCamerasError] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const start = performance.now();
    try {
      const { data } = await api.get('/health');
      setHealth({ ok: data.ok, time: data.time, latencyMs: Math.round(performance.now() - start) });
    } catch (e) {
      setHealth({ ok: false, error: e instanceof Error ? e.message : 'Unreachable' });
    }
    getAllCameras()
      .then((c) => { setCameras(c); setCamerasError(false); })
      .catch(() => setCamerasError(true)); // was a silent no-op — every card below reads `cameras`, so a fetch failure looked identical to "zero active cameras" everywhere at once
    setTick(t => t + 1);
  }

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const aiCams = cameras.filter(c => c.ai_last_seen_at && Date.now() - parseBackendDate(c.ai_last_seen_at).getTime() < 2 * 60 * 1000);
  const streamCams = cameras.filter(c => c.stream_url);
  const aiRunning = aiCams.length > 0;

  // Voice/emotion are configured per ai-service .env (VOSK_MODEL_PATH /
  // EMOTION_MODEL_PATH), not per camera, but the heartbeat that reports
  // them is per camera — so "configured" here means at least one
  // currently-active camera's AI service reported it as on. `null` means
  // no active camera has reported either way yet (an older ai-service
  // build, or no camera has heartbeated at all) — shown distinctly from
  // a real "reported off", per the final audit's "don't fabricate a
  // status you don't actually have" rule.
  const reportingCams = aiCams.filter(c => c.ai_voice_enabled !== null || c.ai_emotion_enabled !== null || c.ai_fall_enabled !== null);
  const voiceStatus: 'configured' | 'not_configured' | 'unknown' =
    reportingCams.length === 0 ? 'unknown' : reportingCams.some(c => c.ai_voice_enabled === 1) ? 'configured' : 'not_configured';
  const emotionStatus: 'configured' | 'not_configured' | 'unknown' =
    reportingCams.length === 0 ? 'unknown' : reportingCams.some(c => c.ai_emotion_enabled === 1) ? 'configured' : 'not_configured';
  const fallStatus: 'configured' | 'not_configured' | 'unknown' =
    reportingCams.length === 0 ? 'unknown' : reportingCams.some(c => c.ai_fall_enabled === 1) ? 'configured' : 'not_configured';

  return (
    <Layout>
      <PageHeader title="AI System Monitoring" subtitle={`Auto-refreshes every 15s · last updated ${new Date().toLocaleTimeString()}`} action={
        <button onClick={refresh} className="text-xs font-semibold text-navy border border-navy/20 px-3 py-1.5 rounded-lg hover:bg-navy-mist transition-colors">Refresh now</button>
      } />

      {/* Backend health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-3 h-3 rounded-full ${health?.ok ? 'bg-teal animate-pulse' : 'bg-crimson'}`} />
            <span className="font-display font-semibold text-sm text-[#0F172A]">Backend API</span>
          </div>
          {health?.ok ? (
            <>
              <p className="text-2xl font-display font-bold text-teal">{health.latencyMs} ms</p>
              <p className="text-xs text-[#94A3B8] mt-1">Response time</p>
            </>
          ) : (
            <p className="text-sm text-crimson">{health?.error ?? 'Checking…'}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] mb-2">AI Cameras Active</p>
          <p className="text-3xl font-display font-bold text-[#0F172A]">{aiCams.length}<span className="text-base font-normal text-[#94A3B8]"> / {streamCams.length} configured</span></p>
          {camerasError ? (
            <p className="text-[11px] text-crimson mt-1">Last refresh failed — may be outdated</p>
          ) : (
            <Indicator active={aiRunning} label={aiRunning ? 'Service running' : 'Service offline'} />
          )}
        </div>

        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] mb-2">Total Cameras</p>
          <p className="text-3xl font-display font-bold text-[#0F172A]">{cameras.length}</p>
          {camerasError && <p className="text-[11px] text-crimson mt-1">Last refresh failed — may be outdated</p>}
          <p className="text-xs text-[#94A3B8] mt-1">{cameras.filter(c => c.status === 'active').length} active registrations</p>
        </div>
      </div>

      {/* Module status */}
      <div className="bg-white rounded-2xl border border-black/5 p-5 mb-6">
        <h3 className="font-display font-semibold text-sm text-[#0F172A] mb-4">AI Module Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            { name: 'Mobile App API', desc: 'Auth, alerts, helpers, authorities, cameras, missing persons', state: health?.ok ? 'active' : 'inactive' },
            { name: 'Push Notifications', desc: 'Real-time Expo push to helpers, authorities and reporters', state: health?.ok ? 'active' : 'inactive' },
            { name: 'Live Location Sharing', desc: 'Background tracking for missions and emergency-contact shares', state: health?.ok ? 'active' : 'inactive' },
            { name: 'Face Detection (SCRFD)', desc: 'InsightFace SCRFD — part of the buffalo_l model pack', state: aiRunning ? 'active' : 'inactive' },
            { name: 'Face Recognition (ArcFace)', desc: 'InsightFace ArcFace — generates 512-d embeddings for matching', state: aiRunning ? 'active' : 'inactive' },
            { name: 'Gesture SOS Detection', desc: 'MediaPipe hand landmarks — requires the AI service to be running', state: aiRunning ? 'active' : 'inactive' },
            {
              name: 'Fall & Posture Analysis',
              desc: fallStatus === 'unknown'
                ? 'YOLO person detector — no active camera has reported its status yet'
                : 'YOLO person detector — fall confirmation and irregular posture analysis',
              state: fallStatus === 'configured' ? 'active' : fallStatus === 'not_configured' ? 'not_configured' : 'unknown',
            },
            {
              name: 'Voice Keyword Detection',
              desc: voiceStatus === 'unknown'
                ? 'Optional Vosk model — no active camera has reported its status yet'
                : 'Optional Vosk model — reported by the AI service itself, via camera heartbeat',
              state: voiceStatus === 'configured' ? 'active' : voiceStatus === 'not_configured' ? 'not_configured' : 'unknown',
            },
            {
              name: 'Emotion Detection',
              desc: emotionStatus === 'unknown'
                ? 'Optional Keras model — no active camera has reported its status yet'
                : 'Optional Keras model — reported by the AI service itself, via camera heartbeat',
              state: emotionStatus === 'configured' ? 'active' : emotionStatus === 'not_configured' ? 'not_configured' : 'unknown',
            },
          ] as const).map(m => (
            <div key={m.name} className="flex items-start gap-3 p-4 rounded-xl border border-black/5">
              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${m.state === 'active' ? 'bg-teal' : m.state === 'unknown' ? 'bg-[#E2E8F0]' : 'bg-[#CBD5E1]'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-sm text-[#0F172A]">{m.name}</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${m.state === 'active' ? 'bg-teal-mist text-teal' : 'bg-black/5 text-[#64748B]'}`}>
                    {m.state === 'active' ? 'Active' : m.state === 'not_configured' ? 'Model not configured' : m.state === 'unknown' ? 'Not reported' : 'Offline'}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live camera AI status table */}
      {cameras.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5">
            <h3 className="font-display font-semibold text-sm text-[#0F172A]">Camera AI Heartbeats</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Cameras the AI service has sent at least one heartbeat for</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                <th className="px-5 py-3 font-medium">Camera</th>
                <th className="px-5 py-3 font-medium">AI Status</th>
                <th className="px-5 py-3 font-medium">Last Heartbeat</th>
                <th className="px-5 py-3 font-medium">Stream</th>
              </tr>
            </thead>
            <tbody>
              {cameras.filter(c => c.stream_url).map(c => {
                const ageMs = c.ai_last_seen_at ? Date.now() - parseBackendDate(c.ai_last_seen_at).getTime() : null;
                const live = ageMs !== null && ageMs < 2 * 60 * 1000;
                return (
                  <tr key={c.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-3 font-medium text-[#0F172A]">{c.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${live ? 'bg-teal-mist text-teal' : 'bg-black/5 text-[#94A3B8]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-teal' : 'bg-[#CBD5E1]'}`} />
                        {live ? 'Active' : c.ai_last_seen_at ? 'Stale' : 'Never connected'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#64748B] text-xs">{c.ai_last_seen_at ? parseBackendDate(c.ai_last_seen_at).toLocaleString() : '—'}</td>
                    <td className="px-5 py-3 text-[#94A3B8] text-xs font-mono truncate max-w-[140px]">{c.stream_url}</td>
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
