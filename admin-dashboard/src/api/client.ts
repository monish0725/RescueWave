import axios from 'axios';

// Same backend the mobile app talks to. In dev, Vite runs on localhost so
// "localhost" resolves correctly here (unlike the mobile app on a phone,
// which needs the machine's LAN IP) — override via VITE_API_URL if your
// backend runs somewhere else.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const TOKEN_KEY = 'rescuewave_admin_token';

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.message === 'Network Error') return "Can't reach the RescueWave backend. Is it running?";
    return err.message;
  }
  return 'Something went wrong';
}

export default api;
