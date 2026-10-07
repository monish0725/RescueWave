import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { getUsers, makeAdmin, revokeAdmin } from '@/api/admin';
import type { AdminUser } from '@/api/types';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { SkeletonTable } from '@/components/Skeleton';

const ROLES = ['', 'user', 'helper', 'authority', 'admin'];

export default function Users() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setUsers(await getUsers({ role: role || undefined, search: search || undefined }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function toggleAdmin(u: AdminUser) {
    try {
      if (u.is_admin) await revokeAdmin(u.id);
      else await makeAdmin(u.id);
      toast(u.is_admin ? `Revoked admin from ${u.name}` : `${u.name} is now an admin`, 'success');
      load();
    } catch {
      toast('Failed to update admin status', 'error');
    }
  }

  return (
    <Layout>
      <PageHeader title="Users" subtitle={`${users.length} shown`} />

      <div className="flex gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search name or email…"
          className="flex-1 max-w-xs border border-black/10 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-black/10 rounded-xl px-3.5 py-2 text-sm">
          {ROLES.map((r) => (
            <option key={r} value={r}>{r ? r[0].toUpperCase() + r.slice(1) : 'All roles'}</option>
          ))}
        </select>
        <button onClick={load} className="bg-navy text-white text-sm font-semibold rounded-xl px-4 py-2">Search</button>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wide text-[#64748B]">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium text-right">Admin</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-[#94A3B8]">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-[#94A3B8]">No users found.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-black/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-[#0F172A]">{u.name}</td>
                  <td className="px-5 py-3 text-[#64748B]">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="capitalize text-[#334155]">{u.role}</span>
                    {u.role === 'authority' && u.authority_org ? <span className="text-[#94A3B8]"> · {u.authority_org}</span> : null}
                  </td>
                  <td className="px-5 py-3 text-[#94A3B8]">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={u.id === me?.id}
                      className={`text-xs font-semibold ${u.is_admin ? 'text-crimson' : 'text-navy'} disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      {u.is_admin ? 'Revoke admin' : 'Make admin'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
