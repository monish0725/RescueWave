import api, { extractErrorMessage } from './client';
import type { AuthorityApplication, AuthorityType, AuthUser } from '@/types';

export interface ApplyAuthorityInput {
  authority_type: AuthorityType;
  org_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address?: string;
  lat?: number;
  lng?: number;
  license_or_badge_id?: string;
}

export async function applyAsAuthority(input: ApplyAuthorityInput): Promise<AuthorityApplication> {
  try {
    const { data } = await api.post('/authorities/apply', input);
    return data.application;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function getMyAuthorityStatus(): Promise<{ application: AuthorityApplication | null; profile: AuthUser }> {
  const { data } = await api.get('/authorities/me');
  return data;
}

export async function pingAuthorityLocation(lat: number, lng: number): Promise<void> {
  await api.post('/authorities/me/location', { lat, lng }).catch(() => {});
}
