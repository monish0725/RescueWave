import api, { extractErrorMessage } from './client';
import type { Camera, CameraPlacement, NearbyCctvCoverage } from '@/types';

interface RegisterCameraInput {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  placement: CameraPlacement;
  direction?: string;
  coverage_notes?: string;
  coverage_radius_m?: number;
  owner_name?: string;
  owner_phone?: string;
  terms_accepted: boolean;
  stream_url?: string;
}

export async function registerCamera(input: RegisterCameraInput): Promise<Camera> {
  try {
    const { data } = await api.post('/cameras', input);
    return data.camera;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function getMyCameras(): Promise<Camera[]> {
  const { data } = await api.get('/cameras/mine');
  return data.cameras;
}

export async function updateCamera(id: string, input: Partial<RegisterCameraInput> & { status?: 'active' | 'inactive' }): Promise<Camera> {
  try {
    const { data } = await api.patch(`/cameras/${id}`, input);
    return data.camera;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function deleteCamera(id: string): Promise<void> {
  await api.delete(`/cameras/${id}`);
}

export interface CameraMonitoringStatus {
  activeCameraCount: number;
  lastHeartbeatAt: string | null;
}

// Network-wide AI monitoring status, not scoped to any one camera — used by
// the missing-person screens to say honestly whether AI camera matching is
// actually running right now, instead of inferring it from a single case's
// match count (a case with zero matches so far looks identical to a case
// nobody is actually scanning for, unless we ask this directly).
export async function getCameraMonitoringStatus(): Promise<CameraMonitoringStatus> {
  const { data } = await api.get('/cameras/monitoring-status');
  return data;
}

export async function getNearbyCctvCoverage(lat: number, lng: number, radiusKm = 6): Promise<NearbyCctvCoverage> {
  try {
    const { data } = await api.get('/cameras/nearby', { params: { lat, lng, radiusKm } });
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}
