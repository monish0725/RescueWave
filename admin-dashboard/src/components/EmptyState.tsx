export default function EmptyState({ icon, title, subtitle, action }: { icon?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-4xl mb-4 opacity-40">{icon}</div>}
      <h3 className="font-display font-semibold text-[#334155] text-base">{title}</h3>
      {subtitle && <p className="text-sm text-[#94A3B8] mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
