import api, { extractErrorMessage } from './client';

export type UploadKind = 'image' | 'video' | 'audio';

const MIME_BY_KIND: Record<UploadKind, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/m4a',
};

/**
 * Uploads a local file (photo/video/voice note) to the backend's real disk
 * storage (see backend/src/routes/uploads.js — no paid cloud storage
 * configured, so files genuinely live on the backend server) and returns
 * the URL to attach to a report.
 */
export async function uploadEvidenceFile(localUri: string, kind: UploadKind, filename?: string): Promise<string> {
  const form = new FormData();
  const name = filename || `${kind}-${Date.now()}.${kind === 'image' ? 'jpg' : kind === 'video' ? 'mp4' : 'm4a'}`;
  // React Native's fetch/FormData accepts this { uri, name, type } shape for
  // file fields — it is not a real Blob/File, but RN's networking layer
  // knows how to stream it from the local URI.
  form.append('file', { uri: localUri, name, type: MIME_BY_KIND[kind] } as any);

  try {
    const { data } = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data.url as string;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export function resolveMediaUrl(apiBaseUrl: string, relativeUrl: string): string {
  const origin = apiBaseUrl.replace(/\/api\/?$/, '');
  return relativeUrl.startsWith('http') ? relativeUrl : `${origin}${relativeUrl}`;
}
