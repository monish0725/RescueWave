import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/Toast';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Alerts from '@/pages/Alerts';
import Users from '@/pages/Users';
import Helpers from '@/pages/Helpers';
import Authorities from '@/pages/Authorities';
import Cameras from '@/pages/Cameras';
import MissingPersons from '@/pages/MissingPersons';
import SystemHealth from '@/pages/SystemHealth';
import Analytics from '@/pages/Analytics';
import AIMonitoring from '@/pages/AIMonitoring';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-[#64748B] text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="/helpers" element={<ProtectedRoute><Helpers /></ProtectedRoute>} />
        <Route path="/authorities" element={<ProtectedRoute><Authorities /></ProtectedRoute>} />
        <Route path="/cameras" element={<ProtectedRoute><Cameras /></ProtectedRoute>} />
        <Route path="/missing-persons" element={<ProtectedRoute><MissingPersons /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/ai-monitoring" element={<ProtectedRoute><AIMonitoring /></ProtectedRoute>} />
        <Route path="/system-health" element={<ProtectedRoute><SystemHealth /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
