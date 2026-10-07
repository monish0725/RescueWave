import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import api, { TOKEN_KEY, extractErrorMessage } from '@/api/client';
import { unregisterCurrentPushToken } from '@/utils/pushRegistration';
import { activateLocalUser } from '@/db/database';
import type { AuthUser } from '@/types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (input: { name?: string; phone?: string; blood_group?: string; medical_info?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          activateLocalUser(data.user.id);
          setUser(data.user);
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      activateLocalUser(data.user.id);
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, phone?: string) => {
    try {
      const { data } = await api.post('/auth/register', { name, email, password, phone });
      activateLocalUser(data.user.id);
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await unregisterCurrentPushToken();
    } catch {
      // best-effort — don't block logout on this
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  }, []);

  const updateProfile = useCallback(async (input: { name?: string; phone?: string; blood_group?: string; medical_info?: string }) => {
    try {
      const { data } = await api.patch('/users/me', input);
      setUser(data.user);
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, refreshProfile, updateProfile, changePassword }),
    [user, isLoading, login, register, logout, refreshProfile, updateProfile, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
