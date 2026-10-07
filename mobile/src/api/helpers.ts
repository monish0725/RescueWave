import api, { extractErrorMessage } from './client';
import type { HelperApplication, HelperSkill, AuthUser } from '@/types';

export interface ApplyHelperInput {
  full_name: string;
  phone: string;
  email: string;
  address?: string;
  skills: HelperSkill[];
  availability?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

export async function applyToBeHelper(input: ApplyHelperInput): Promise<HelperApplication> {
  try {
    const { data } = await api.post('/helpers/apply', input);
    return data.application;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function getMyHelperStatus(): Promise<{ application: HelperApplication | null; profile: AuthUser }> {
  const { data } = await api.get('/helpers/me');
  return data;
}

export async function setHelperAvailability(status: 'available' | 'busy' | 'offline'): Promise<void> {
  try {
    await api.patch('/helpers/me/status', { status });
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function pingHelperLocation(lat: number, lng: number): Promise<void> {
  await api.post('/helpers/me/location', { lat, lng }).catch(() => {});
}
