const COLORS: Record<string, string> = {
  open: 'bg-crimson-mist text-crimson',
  assigned: 'bg-amber-mist text-amber',
  completed: 'bg-teal-mist text-teal',
  cancelled: 'bg-black/5 text-[#64748B]',
  pending: 'bg-amber-mist text-amber',
  approved: 'bg-teal-mist text-teal',
  rejected: 'bg-crimson-mist text-crimson',
  submitted: 'bg-amber-mist text-amber',
  under_review: 'bg-navy-mist text-navy',
  verified: 'bg-teal-mist text-teal',
  resolved: 'bg-teal-mist text-teal',
  active: 'bg-teal-mist text-teal',
  inactive: 'bg-black/5 text-[#64748B]',
  missing: 'bg-crimson-mist text-crimson',
  found: 'bg-teal-mist text-teal',
};

export default function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${COLORS[status] ?? 'bg-black/5 text-[#64748B]'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
