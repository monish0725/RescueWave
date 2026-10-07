import React, { useEffect, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { SkeletonTable } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { getAllAlerts, getAlertDetail, reviewAlert } from '@/api/admin';
import { API_URL } from '@/api/client';
import type { AdminAlert, AlertDetail } from '@/api/types';

const STATUSES = ['', 'open', 'assigned', 'completed', 'cancelled'];
const SOURCES = ['', 'manual_sos', 'citizen_report', 'camera_ai'];
const REPORT_STATUSES = ['', 'submitted', 'under_review', 'verified', 'resolved', 'rejected'];
const REVIEW_ACTIONS: Array<{ status: AdminAlert['report_status']; label: string; severity?: NonNullable<AdminAlert['severity']> }> = [
  { status: 'under_review', label: 'Review' },
  { status: 'verified', label: 'Verify' },
  { status: 'resolved', label: 'Resolve' },
  { status: 'rejected', label: 'Reject', severity: 'low' },
];

const SOURCE_CONFIG: Record<string, { label: string; className: string; icon: string }> = {
  manual_sos: { label: 'SOS', className: 'bg-crimson-mist text-crimson', icon: '🚨' },
  camera_ai: { label: 'Camera AI', className: 'bg-navy-mist text-navy', icon: '📷' },
  citizen_report: { label: 'Report', className: 'bg-amber-mist text-amber', icon: '📋' },
};

const REPORT_STATUS_CLASS: Record<string, string> = {
  submitted: 'bg-amber-mist text-amber',
  under_review: 'bg-navy-mist text-navy',
  verified: 'bg-teal-mist text-teal',
  resolved: 'bg-teal-mist text-teal',
  rejected: 'bg-crimson-mist text-crimson',
};

const SEVERITY_CLASS: Record<string, string> = {
  low: 'bg-[#F8FAFC] text-[#64748B]',
  medium: 'bg-amber-mist text-amber',
  high: 'bg-crimson-mist text-crimson',
  critical: 'bg-crimson text-white',
};

// final-audit Phase 10 — a readable label + icon for whatever `status`
// string shows up in alert_status_events.status. Verified against the
// actual strings backend/src/routes/alerts.js inserts (not guessed):
// 'open' at creation; Helper track: 'accepted' | 'rejected_by_helper' |
// 'on_the_way' | 'arrived' | 'assisting' | 'completed'; Authority track:
// 'accepted' | 'en_route' | 'on_scene' | 'investigating' | 'closed';
// 'cancelled' if the reporter cancels. Unrecognized values still render
// fine via the fallback below, just without a specific icon.
const EVENT_STYLE: Record<string, { icon: string; label: string }> = {
  open: { icon: '🆕', label: 'Alert created' },
  accepted: { icon: '✅', label: 'Accepted' },
  rejected_by_helper: { icon: '✕', label: 'Declined by Helper' },
  on_the_way: { icon: '🚗', label: 'On the way' },
  arrived: { icon: '📍', label: 'Arrived' },
  assisting: { icon: '🤝', label: 'Assisting' },
  en_route: { icon: '🚗', label: 'En route' },
  on_scene: { icon: '📍', label: 'On scene' },
  investigating: { icon: '🔍', label: 'Investigating' },
  completed: { icon: '🏁', label: 'Completed' },
  closed: { icon: '🏁', label: 'Closed' },
  cancelled: { icon: '🚫', label: 'Cancelled' },
  review_under_review: { icon: '🔎', label: 'Report under review' },
  review_verified: { icon: '✅', label: 'Report verified' },
  review_resolved: { icon: '🏁', label: 'Report resolved' },
  review_rejected: { icon: '🚫', label: 'Report rejected' },
};

function eventStyle(status: string) {
  return EVENT_STYLE[status] || { icon: '•', label: status.replace(/_/g, ' ') };
}

const ACTOR_LABEL: Record<string, string> = { helper: 'Helper', authority: 'Authority', reporter: 'Reporter', system: 'System' };

function mediaUrl(path: string) {
  return `${API_URL.replace(/\/api\/?$/, '')}${path}`;
}

export default function Alerts() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminAlert | null>(null);
  const [details, setDetails] = useState<Record<string, AlertDetail | 'loading' | 'error'>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      setAlerts(await getAllAlerts({ status: status || undefined, source: source || undefined, report_status: reportStatus || undefined }));
    } catch {
      toast('Failed to load alerts', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    intervalRef.current = setInterval(load, 20000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status, source, reportStatus]);

  function toggle(a: AdminAlert) {
    const next = selected?.id === a.id ? null : a;
    setSelected(next);
    if (next && !details[next.id]) {
      setDetails((d) => ({ ...d, [next.id]: 'loading' }));
      getAlertDetail(next.id)
        .then((detail) => setDetails((d) => ({ ...d, [next.id]: detail })))
        .catch(() => setDetails((d) => ({ ...d, [next.id]: 'error' })));
    }
  }

  async function review(e: React.MouseEvent, alert: AdminAlert, report_status: AdminAlert['report_status'], severity?: NonNullable<AdminAlert['severity']>) {
    e.stopPropagation();
    setReviewingId(alert.id);
    try {
      const updated = await reviewAlert(alert.id, {
        report_status,
        severity,
        note: `Admin marked ${alert.source === 'citizen_report' ? 'incident report' : 'alert'} as ${report_status.replace(/_/g, ' ')}`,
      });
      setAlerts((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      setSelected((current) => current?.id === updated.id ? updated : current);
      setDetails((d) => {
        const current = d[updated.id];
        if (!current || current === 'loading' || current === 'error') return d;
        return { ...d, [updated.id]: { ...current, alert: updated } };
      });
      toast('Review status updated', 'success');
    } catch {
      toast('Could not update review status', 'error');
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <Layout>
      <PageHeader
        title="Live Alerts & Reports"
        subtitle={`${alerts.length} shown · auto-refreshes every 20s`}
        action={<div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-crimson animate-pulse" />
          <span className="text-xs text-[#94A3B8]">Live</span>
        </div>}
      />

      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={status} onChange={e => setStatus(e.target.value)} className="border border-black/10 rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy/20">
          {STATUSES.map(s => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} className="border border-black/10 rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy/20">
          {SOURCES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All sources'}</option>)}
        </select>
        <select value={reportStatus} onChange={e => setReportStatus(e.target.value)} className="border border-black/10 rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy/20">
          {REPORT_STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All review statuses'}</option>)}
        </select>
      </div>

      {loading ? (
        <SkeletonTable />
      ) : alerts.length === 0 ? (
        <EmptyState icon="🚨" title="No alerts found" subtitle="Alerts will appear here as they are raised via the mobile app or AI camera service." />
      ) : (
        <div className="space-y-3">
          {alerts.map(a => {
            const src = SOURCE_CONFIG[a.source] || { label: a.source, className: 'bg-black/5 text-[#64748B]', icon: '📄' };
            return (
              <div key={a.id} onClick={() => toggle(a)} className="bg-white rounded-2xl border border-black/5 p-5 cursor-pointer hover:border-navy/20 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${src.className}`}>{src.icon} {src.label}</span>
                      {a.category && <span className="text-[10px] font-semibold text-[#64748B] capitalize px-2 py-0.5 bg-[#F8FAFC] rounded-full">{a.category.replace('_', ' ')}</span>}
                      <Badge status={a.status} />
                      {a.authority_status && <Badge status={a.authority_status} />}
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${REPORT_STATUS_CLASS[a.report_status] || 'bg-black/5 text-[#64748B]'}`}>{a.report_status.replace(/_/g, ' ')}</span>
                      {a.severity && <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${SEVERITY_CLASS[a.severity] || 'bg-black/5 text-[#64748B]'}`}>{a.severity}</span>}
                    </div>
                    <p className="text-sm text-[#0F172A] font-medium">{a.description || '(No description)'}</p>
                    <p className="text-xs text-[#94A3B8] mt-1">📍 {a.address || 'No location'} · {new Date(a.created_at).toLocaleString()}</p>
                  </div>
                  <span className="text-xs text-[#94A3B8] shrink-0">{selected?.id === a.id ? '▲' : '▼'}</span>
                </div>

                {selected?.id === a.id && (
                  <div className="mt-4 pt-4 border-t border-black/5">
                    {(() => {
                      const detail = details[a.id];
                      if (detail === 'loading' || detail === undefined) {
                        return <p className="text-xs text-[#94A3B8] mb-4">Loading timeline…</p>;
                      }
                      if (detail === 'error') {
                        return <p className="text-xs text-crimson mb-4">Could not load this alert's timeline. Please try again.</p>;
                      }
                      return (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-4">
                            <div><span className="text-[#94A3B8] block">Alert ID</span><code className="text-[#334155] text-[10px]">{a.id.split('-')[0]}</code></div>
                            <div><span className="text-[#94A3B8] block">Reporter</span><span className="text-[#334155]">{detail.reporter?.name || (a.reporter_id ? 'Not visible to this account' : '—')}</span></div>
                            <div><span className="text-[#94A3B8] block">Helper</span><span className="text-[#334155]">{detail.helper?.name || '—'}</span></div>
                            <div><span className="text-[#94A3B8] block">Authority</span><span className="text-[#334155]">{detail.authority?.name || '—'}{detail.authority?.authority_org ? ` (${detail.authority.authority_org})` : ''}</span></div>
                            <div><span className="text-[#94A3B8] block">Auth status</span><span className="text-[#334155] capitalize">{a.authority_status || '—'}</span></div>
                            <div><span className="text-[#94A3B8] block">Review status</span><span className="text-[#334155] capitalize">{a.report_status.replace(/_/g, ' ')}</span></div>
                            <div><span className="text-[#94A3B8] block">Severity</span><span className="text-[#334155] capitalize">{a.severity || '—'}</span></div>
                            <div><span className="text-[#94A3B8] block">Updated</span><span className="text-[#334155]">{new Date(a.updated_at).toLocaleString()}</span></div>
                            <div><span className="text-[#94A3B8] block">Location</span><span className="text-[#334155]">{typeof a.lat === 'number' && typeof a.lng === 'number' ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : '—'}</span></div>
                            <div><span className="text-[#94A3B8] block">Admin note</span><span className="text-[#334155]">{a.admin_note || '—'}</span></div>
                          </div>

                          <div className="flex gap-2 flex-wrap mb-4">
                            {REVIEW_ACTIONS.map((action) => (
                              <button
                                key={action.status}
                                type="button"
                                disabled={reviewingId === a.id || a.report_status === action.status}
                                onClick={(e) => review(e, a, action.status, action.severity)}
                                className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold text-[#334155] bg-white hover:border-navy/30 disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                {reviewingId === a.id ? 'Saving...' : action.label}
                              </button>
                            ))}
                          </div>

                          {/* final-audit Phase 10 — real lifecycle timeline from
                              alert_status_events, not a fixed step list: only
                              states that actually happened for THIS alert show up,
                              each with its real timestamp and actor. */}
                          {detail.events.length > 0 && (
                            <div className="mb-4">
                              <p className="text-[10px] font-bold uppercase text-[#94A3B8] mb-2">Timeline</p>
                              <div className="space-y-2">
                                {detail.events.map((ev) => {
                                  const style = eventStyle(ev.status);
                                  return (
                                    <div key={ev.id} className="flex items-start gap-2.5 text-xs">
                                      <span className="mt-0.5">{style.icon}</span>
                                      <div className="flex-1">
                                        <span className="text-[#0F172A] font-medium">{style.label}</span>
                                        {ev.actor_role && <span className="text-[#94A3B8]"> · {ACTOR_LABEL[ev.actor_role] || ev.actor_role}</span>}
                                        {ev.note && <p className="text-[#64748B] mt-0.5">{ev.note}</p>}
                                      </div>
                                      <span className="text-[#94A3B8] shrink-0">{new Date(ev.created_at).toLocaleTimeString()}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {(a.photo_url || a.video_url || a.voice_url || a.source === 'camera_ai') && (
                      <div className="pt-3 border-t border-black/5">
                        <p className="text-[10px] font-bold uppercase text-[#94A3B8] mb-2">Incident Evidence</p>
                        {a.source === 'camera_ai' && a.description && (
                          <p className="text-xs text-[#334155] bg-[#F8FAFC] rounded-lg px-3 py-2 mb-2">{a.description}</p>
                        )}
                        <div className="flex gap-4">
                          {a.photo_url && <a href={mediaUrl(a.photo_url)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy hover:underline">📷 View photo</a>}
                          {a.video_url && <a href={mediaUrl(a.video_url)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy hover:underline">🎞️ View video</a>}
                          {a.voice_url && <a href={mediaUrl(a.voice_url)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy hover:underline">🎙️ Play voice note</a>}
                          {!a.photo_url && !a.video_url && !a.voice_url && a.source === 'camera_ai' && (
                            <span className="text-xs text-[#94A3B8]">No snapshot/video attached to this alert record — see the AI service's own snapshot storage.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
