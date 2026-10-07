export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-[#0F172A]">{title}</h1>
        {subtitle ? <p className="text-sm text-[#64748B] mt-1">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
