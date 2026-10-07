import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { getAllMissingPersons, getMissingPersonSightings, updateMissingPersonStatus, updateSightingVerification } from '@/api/admin';
import { API_URL } from '@/api/client';
import { useToast } from '@/components/Toast';
import type { AdminMissingPerson, AdminMissingPersonMatch } from '@/api/types';

function mediaUrl(path: string) {
  return `${API_URL.replace(/\/api\/?$/, '')}${path}`;
}

const VERIFICATION_LABEL: Record<AdminMissingPersonMatch['verification_status'], string> = {
  pending: 'Potential — requires verification',
  verified: 'Verified lead',
  rejected: 'Rejected',
  confirmed_sighting: 'Confirmed sighting',
};

const VERIFICATION_STYLE: Record<AdminMissingPersonMatch['verification_status'], string> = {
  pending: 'bg-amber-mist text-amber',
  verified: 'bg-blue-mist text-navy',
  rejected: 'bg-black/5 text-[#64748B] line-through decoration-1',
  confirmed_sighting: 'bg-teal-mist text-teal',
};

const VALIDATION_MESSAGES: Record<NonNullable<AdminMissingPerson['face_validation_reason']>, string> = {
  undecodable: 'Photo could not be read by the AI service.',
  no_face: 'No face was detected in the reference photo.',
  multiple_faces: 'Multiple faces were detected; upload a photo with only this person.',
  face_too_small: 'The face is too small for reliable camera matching.',
  too_blurry: 'The reference photo is too blurry for reliable camera matching.',
};

export default function MissingPersons() {
  const [people, setPeople] = useState<AdminMissingPerson[]>([]);
  const [status, setStatus] = useState('missing');
  const [loading, setLoading] = useState(true);
  const [sightingsFor, setSightingsFor] = useState<AdminMissingPerson | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string } | null>(null);
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    getAllMissingPersons(status || undefined).then(setPeople).finally(() => setLoading(false));
  }, [status]);

  async function changeStatus(person: AdminMissingPerson, next: AdminMissingPerson['status']) {
    setBusyPersonId(person.id);
    try {
      const updated = await updateMissingPersonStatus(person.id, next);
      setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)).filter((p) => !status || p.status === status));
      setSightingsFor((current) => current?.id === updated.id ? updated : current);
      toast(next === 'found' ? 'Case marked found. The uploader was notified.' : 'Case reopened for AI camera matching.', 'success');
    } catch {
      toast('Could not update this missing-person case. Please try again.', 'error');
    } finally {
      setBusyPersonId(null);
    }
  }

  return (
    <Layout>
      <PageHeader title="Missing Persons" subtitle={`${people.length} shown`} />

      <div className="flex gap-2 mb-5">
        {['missing', 'found', ''].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-full text-xs font-semibold capitalize ${status === s ? 'bg-navy text-white' : 'bg-white text-[#64748B] border border-black/10'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[#94A3B8] text-sm">Loading…</div>
      ) : people.length === 0 ? (
        <EmptyState icon="🧑" title="No records" subtitle="No missing-person reports match this filter." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-black/5 p-5">
              <div className="flex items-start gap-3 mb-3">
                {p.photo_url ? (
                  <button
                    type="button"
                    onClick={() => setImagePreview({ src: mediaUrl(p.photo_url!), name: p.name })}
                    className="w-14 h-14 rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
                    title={`View ${p.name}'s photo`}
                  >
                    <img src={mediaUrl(p.photo_url)} alt={p.name} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-navy-mist flex items-center justify-center text-xl">🧑</div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-sm text-[#0F172A]">{p.name}</span>
                    <Badge status={p.status} />
                  </div>
                  <p className="text-xs text-[#64748B]">{[p.age ? `${p.age} yrs` : null, p.gender].filter(Boolean).join(' · ') || 'No demographic details'}</p>
                </div>
              </div>
              <p className="text-xs text-[#94A3B8] mb-1">Last seen: {p.last_seen_location || 'Unknown'}{p.last_seen_date ? ` · ${p.last_seen_date}` : ''}</p>
              <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-black/5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-[#94A3B8]">🧠 AI status:</span>
                  <span className={`text-[10px] font-semibold capitalize ${p.face_validation_status === 'rejected' ? 'text-crimson' : 'text-[#94A3B8]'}`}>
                    {p.face_validation_status === 'rejected' ? 'photo rejected' : p.face_embedding_status.replace('_', ' ')}
                  </span>
                </div>
                <button
                  onClick={() => setSightingsFor(p)}
                  className="text-[11px] font-semibold text-navy hover:underline"
                >
                  View AI Sightings
                </button>
              </div>
              <button
                disabled={busyPersonId === p.id}
                onClick={() => changeStatus(p, p.status === 'missing' ? 'found' : 'missing')}
                className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${p.status === 'missing' ? 'bg-teal-mist text-teal hover:bg-teal hover:text-white' : 'bg-navy-mist text-navy hover:bg-navy hover:text-white'}`}
              >
                {p.status === 'missing' ? 'Mark Person Found' : 'Reopen Missing Case'}
              </button>
              {p.face_validation_status === 'rejected' ? (
                <p className="text-[11px] text-crimson mt-2">
                  {p.face_validation_reason ? VALIDATION_MESSAGES[p.face_validation_reason] : 'The AI service could not use this reference photo.'}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {sightingsFor && (
        <SightingsPanel
          person={sightingsFor}
          onClose={() => setSightingsFor(null)}
          onPreviewImage={(src, name) => setImagePreview({ src, name })}
          onPersonUpdated={(updated) => {
            setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)).filter((p) => !status || p.status === status));
            setSightingsFor(updated);
          }}
        />
      )}
      {imagePreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={() => setImagePreview(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-black/5 flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-[#0F172A]">{imagePreview.name}</h3>
              <button onClick={() => setImagePreview(null)} className="text-[#94A3B8] hover:text-[#0F172A] text-xl leading-none">×</button>
            </div>
            <img src={imagePreview.src} alt={imagePreview.name} className="w-full max-h-[75vh] object-contain bg-black" />
          </div>
        </div>
      )}
    </Layout>
  );
}

function SightingsPanel({
  person,
  onClose,
  onPreviewImage,
  onPersonUpdated,
}: {
  person: AdminMissingPerson;
  onClose: () => void;
  onPreviewImage: (src: string, name: string) => void;
  onPersonUpdated: (person: AdminMissingPerson) => void;
}) {
  const [matches, setMatches] = useState<AdminMissingPersonMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();

  function load() {
    setError(null);
    getMissingPersonSightings(person.id)
      .then(setMatches)
      .catch(() => setError('Could not load AI sightings for this case. Please try again.'));
  }

  useEffect(load, [person.id]);

  async function act(match: AdminMissingPersonMatch, next: 'verified' | 'rejected' | 'confirmed_sighting') {
    setBusyId(match.id);
    try {
      const updated = await updateSightingVerification(person.id, match.id, next);
      setMatches((prev) => (prev ? prev.map((m) => (m.id === match.id ? updated : m)) : prev));
      if (next === 'confirmed_sighting') {
        const found = await updateMissingPersonStatus(person.id, 'found');
        onPersonUpdated(found);
      }
      toast(`Marked as ${VERIFICATION_LABEL[next].toLowerCase()}.`, 'success');
    } catch {
      toast('Could not update this sighting. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="font-display font-semibold text-base text-[#0F172A]">AI Sightings — {person.name}</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Every camera-AI potential match for this case. AI recognition is a lead, never proof — a human decides here.</p>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A] text-xl leading-none">×</button>
        </div>

        <div className="p-6">
          {error ? (
            <p className="text-sm text-crimson">{error}</p>
          ) : matches === null ? (
            <div className="text-[#94A3B8] text-sm">Loading…</div>
          ) : matches.length === 0 ? (
            person.face_validation_status === 'rejected' ? (
              <div className="rounded-xl border border-crimson/20 bg-crimson-mist p-4">
                <p className="font-display font-semibold text-sm text-crimson">Reference photo not usable for AI matching</p>
                <p className="text-xs text-crimson mt-1">
                  {person.face_validation_reason ? VALIDATION_MESSAGES[person.face_validation_reason] : 'The AI service rejected this photo.'}
                </p>
                <p className="text-xs text-crimson/80 mt-2">
                  Upload a clearer single-face photo from the mobile app. The case remains visible in the dashboard, but CCTV matching will not run until the AI service accepts the photo.
                </p>
              </div>
            ) : (
              <EmptyState icon="🔍" title="No AI sightings yet" subtitle="Camera AI hasn't reported a potential match for this case." />
            )
          ) : (
            <div className="space-y-3">
              {matches.map((m) => (
                <div key={m.id} className="border border-black/5 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      {m.snapshot_url ? (
                        <button
                          type="button"
                          onClick={() => onPreviewImage(mediaUrl(m.snapshot_url!), `${person.name} sighting snapshot`)}
                          className="w-16 h-16 rounded-lg overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
                          title="View sighting snapshot"
                        >
                          <img src={mediaUrl(m.snapshot_url)} alt="Match snapshot" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-navy-mist flex items-center justify-center text-lg shrink-0">📷</div>
                      )}
                      <div>
                        <p className="font-display font-semibold text-sm text-[#0F172A]">{m.camera_name || 'Unknown camera'}</p>
                        {m.camera_address ? <p className="text-xs text-[#94A3B8]">{m.camera_address}</p> : null}
                        <p className="text-xs text-[#64748B] mt-1">{new Date(m.matched_at).toLocaleString()}</p>
                        <p className="text-xs text-[#64748B]">
                          {Math.round((m.final_confidence ?? m.confidence) * 100)}% final confidence
                          {m.match_label ? ` · ${m.match_label.replace(/_/g, ' ')}` : ''}
                        </p>
                        <p className="text-xs text-[#94A3B8]">
                          ArcFace {Math.round(m.confidence * 100)}%
                          {m.local_feature_score != null ? ` · Local ${Math.round(m.local_feature_score * 100)}%` : ''}
                          {m.ssim_score != null ? ` · SSIM ${Math.round(m.ssim_score * 100)}%` : ''}
                          {m.face_detection_score != null ? ` · ${Math.round(m.face_detection_score * 100)}% face detection confidence` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full whitespace-nowrap ${VERIFICATION_STYLE[m.verification_status]}`}>
                      {VERIFICATION_LABEL[m.verification_status]}
                    </span>
                  </div>

                  {m.verification_status === 'pending' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-black/5">
                      <button
                        disabled={busyId === m.id}
                        onClick={() => act(m, 'verified')}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-navy-mist text-navy hover:bg-navy hover:text-white transition-colors disabled:opacity-50"
                      >
                        Mark as Verified
                      </button>
                      <button
                        disabled={busyId === m.id}
                        onClick={() => act(m, 'confirmed_sighting')}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-mist text-teal hover:bg-teal hover:text-white transition-colors disabled:opacity-50"
                      >
                        Mark as Confirmed Sighting
                      </button>
                      <button
                        disabled={busyId === m.id}
                        onClick={() => act(m, 'rejected')}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-crimson-mist text-crimson hover:bg-crimson hover:text-white transition-colors disabled:opacity-50"
                      >
                        Reject Match
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
