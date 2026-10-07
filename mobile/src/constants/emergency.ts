// Single source of truth for the emergency-services number used across the
// app (SOS success screen, Help & Support, Home quick-dial). Keeping one
// constant here means these can't silently drift apart the way two
// hard-coded copies eventually would.
export const EMERGENCY_SERVICES_NUMBER = '112';
