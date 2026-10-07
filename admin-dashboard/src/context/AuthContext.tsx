import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { TOKEN_KEY, extractErrorMessage } from '@/api/client';
import type { AdminUser } from '@/api/types';

interface AuthContextValue {
  user: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (!data.user.is_admin) {
        throw new Error('This account does not have admin access. Ask an existing admin to grant it, or use backend/src/admin-cli.js make-admin.');
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (err) {
      throw new Error(err instanceof Error && err.message.includes('admin access') ? err.message : extractErrorMessage(err));
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
