import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const NAV = [
  { to: '/', label: 'Command Center', icon: '📊' },
  { to: '/alerts', label: 'Live Alerts & Reports', icon: '🚨' },
  { to: '/users', label: 'Users', icon: '👥' },
  { to: '/helpers', label: 'Helpers', icon: '🤝' },
  { to: '/authorities', label: 'Authorities', icon: '🛡️' },
  { to: '/cameras', label: 'CCTV Cameras', icon: '📷' },
  { to: '/missing-persons', label: 'Missing Persons', icon: '🔍' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/ai-monitoring', label: 'AI Monitoring', icon: '🤖' },
  { to: '/system-health', label: 'System Health', icon: '⚙️' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-[#F3F5FA]">
      <aside className="w-64 bg-navy text-white flex flex-col shrink-0">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center border border-white/20 overflow-hidden shadow-lg">
            <img src="/brand/rescuewave-mark.png" alt="RescueWave" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="font-display font-semibold text-[15px] leading-tight">RescueWave</div>
            <div className="text-[11px] text-white/60 tracking-wide">Admin Dashboard</div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <div className="text-sm font-medium truncate">{user?.name}</div>
          <div className="text-xs text-white/50 truncate mb-3">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs font-semibold text-white/70 hover:text-white transition-colors"
          >
            Log out →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
