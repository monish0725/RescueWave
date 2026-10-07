export default function StatCard({ label, value, tint = 'navy', sub }: { label: string; value: string | number; tint?: 'navy' | 'crimson' | 'teal' | 'amber' | 'gold'; sub?: string }) {
  const tintClass = {
    navy: 'text-navy bg-navy-mist',
    crimson: 'text-crimson bg-crimson-mist',
    teal: 'text-teal bg-teal-mist',
    amber: 'text-amber bg-amber-mist',
    gold: 'text-gold bg-gold-mist',
  }[tint];

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide mb-3 ${tintClass}`}>{label}</div>
      <div className="font-display font-bold text-3xl text-[#0F172A]">{value}</div>
      {sub ? <div className="text-xs text-[#64748B] mt-1">{sub}</div> : null}
    </div>
  );
}
