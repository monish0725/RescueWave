import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { getAuthorityApplications, reviewAuthorityApplication, getUsers } from '@/api/admin';
import type { AuthorityApplication, AdminUser } from '@/api/types';

export default function Authorities() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'active'>('pending');
  const [applications, setApplications] = useState<AuthorityApplication[]>([]);
  const [activeAuthorities, setActiveAuthorities] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      if (tab === 'active') {
        setActiveAuthorities(await getUsers({ role: 'authority' }));
      } else {
        setApplications(await getAuthorityApplications(tab));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function review(id: string, decision: 'approve' | 'reject') {
    const note = decision === 'reject' ? window.prompt('Reason for rejection (optional):') ?? undefined : undefined;
    try {
      await reviewAuthorityApplication(id, decision, note);
      toast(`Application ${decision}d`, 'success');
      load();
    } catch {
      toast(`Failed to ${decision} application`, 'error');
    }
  }

  return (
    <Layout>
      <PageHeader title="Authorities" subtitle="Police, Hospital and Fire Department organizations" />

      <div className="flex gap-2 mb-5">
        {(['pending', 'approved', 'rejected', 'active'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-xs font-semibold capitalize ${tab === t ? 'bg-navy text-white' : 'bg-white text-[#64748B] border border-black/10'}`}
          >
            {t === 'active' ? 'Active Authorities' : `${t} applications`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[#94A3B8] text-sm">Loading…</div>
      ) : tab === 'active' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeAuthorities.length === 0 ? <p className="text-sm text-[#94A3B8]">No active authorities yet.</p> : null}
          {activeAuthorities.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-black/5 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-sm text-[#0F172A]">{a.authority_org}</span>
                <span className="text-[10px] font-bold uppercase bg-gold-mist text-gold px-2 py-0.5 rounded-full">{a.authority_type}</span>
              </div>
              <p className="text-xs text-[#64748B] mb-3">{a.name} · {a.email}</p>
              <div className="text-xs text-[#334155]"><strong>{a.cases_closed}</strong> cases closed</div>
            </div>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState icon="🛡️" title={`No ${tab} applications`} subtitle="Authority applications from Police, Hospitals and Fire Departments will appear here." />
      ) : (
        <div className="space-y-3">
          {applications.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-black/5 p-5 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-display font-semibold text-sm text-[#0F172A]">{a.org_name}</span>
                  <span className="text-[10px] font-bold uppercase bg-navy-mist text-navy px-2 py-0.5 rounded-full">{a.authority_type}</span>
                  <Badge status={a.status} />
                </div>
                <p className="text-xs text-[#64748B]">{a.contact_name} · {a.email} · {a.phone}</p>
                {a.address ? <p className="text-xs text-[#94A3B8] mt-1">{a.address}</p> : null}
                {a.admin_note ? <p className="text-xs text-[#94A3B8] mt-2">Note: {a.admin_note}</p> : null}
              </div>
              {a.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => review(a.id, 'approve')} className="bg-navy text-white text-xs font-semibold rounded-lg px-3 py-2">Approve</button>
                  <button onClick={() => review(a.id, 'reject')} className="border border-black/10 text-[#64748B] text-xs font-semibold rounded-lg px-3 py-2">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
