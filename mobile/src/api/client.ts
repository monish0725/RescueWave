import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const explicitApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
const expoHostUri =
  Constants.expoConfig?.hostUri ||
  Constants.manifest2?.extra?.expoClient?.hostUri ||
  Constants.manifest?.debuggerHost;
const devServerHost = expoHostUri?.split(':')[0];

// In Expo Go on a physical phone, localhost is the phone itself. Derive the
// dev machine's LAN IP from Expo's own dev-server host (real, from this
// session) rather than falling back to a hardcoded address that belonged to
// someone else's machine and would silently point every install at a
// server that isn't theirs. If neither an explicit `extra.apiUrl` nor a
// derivable dev-server host is available, there is no address to use —
// fail clearly instead of guessing one.
export const API_URL = explicitApiUrl || envApiUrl || (devServerHost ? `http://${devServerHost}:4000/api` : null);

export const TOKEN_KEY = 'rescuewave_auth_token';

export const api = axios.create({ baseURL: API_URL ?? undefined, timeout: 10000 });

api.interceptors.request.use(async (config) => {
  if (!API_URL) {
    return Promise.reject(
      new Error(
        "RescueWave isn't configured with a server address. Set EXPO_PUBLIC_API_URL (or extra.apiUrl in app.json/app.config) to your RescueWave backend's URL and restart the app.",
      ),
    );
  }
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.message === 'Network Error') {
      return 'Cannot reach the RescueWave server. Check that the backend is running and that API_URL points to your computer\'s IP address.';
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export default api;
