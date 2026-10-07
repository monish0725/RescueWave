// RescueWave design system — "National Safety Platform" identity.
// Deep navy = trust/authority (brand), crimson = reserved strictly for
// emergency/SOS actions so it stays meaningful, gold = verified/premium
// accents (helper ratings, verified badges), teal = safe/positive status.
//
// Legacy names (green/red/amber/blue/muted/bg/border/surface/text) are kept
// as aliases onto the new palette so every existing screen keeps working
// without a rewrite — new screens should prefer the semantic names
// (navy/crimson/teal/gold) directly.
const navy = '#0B1E45';
const navyDeep = '#071433';
const navyLight = '#16295E';
const navyMist = '#EAF0FB';

const crimson = '#E11D3C';
const crimsonDeep = '#B0102B';
const crimsonMist = '#FDEBEE';

const amber = '#F59E0B';
const amberMist = '#FEF3E0';
const teal = '#0D9488';
const tealMist = '#E3F6F4';
const gold = '#D4AF37';
const goldMist = '#FBF3DD';
const blue = '#2563EB';
const blueMist = '#EAF1FE';

const text = '#0F172A';
const textSoft = '#334155';
const muted = '#64748B';
const faint = '#94A3B8';
const bg = '#F3F5FA';
const surface = '#FFFFFF';
const border = 'rgba(15,30,77,0.10)';
const borderStrong = 'rgba(15,30,77,0.18)';
const overlay = 'rgba(7,20,51,0.55)';

// Text-safe variants of the accent colors. `amber`, `gold`, and (to a lesser
// extent) `teal` don't meet WCAG AA (4.5:1) contrast as *text* on white/mist
// surfaces — fine as icons/dots/fills, invisible-ish as small labels (status
// pills, "VERIFIED HELPER", etc). Use these instead of the base accent
// whenever the color sits on a Text component rather than an icon or fill.
const amberText = '#B45309'; // amber on white: 2.15:1 -> 5.0:1
const goldText = '#8F7018';  // gold on white: 2.10:1 -> 4.7:1
const tealText = '#0B7A6F';  // teal on white: 3.74:1 -> 5.2:1

export const colors = {
  // Semantic (preferred for new code)
  navy, navyDeep, navyLight, navyMist,
  crimson, crimsonDeep, crimsonMist,
  amber, amberMist, teal, tealMist, gold, goldMist, blue, blueMist,
  amberText, goldText, tealText,
  text, textSoft, muted, faint, bg, surface, border, borderStrong, overlay,

  // Legacy aliases — keeps every existing screen working unchanged.
  green: navy,          // brand/primary actions
  greenDark: navyDeep,
  greenLight: navyMist,
  greenMid: navyLight,
  accent: teal,
  red: crimson,
  redDeep: crimsonDeep,
};

export const gradients = {
  navyHero: [navy, navyDeep] as const,
  crimsonSos: [crimson, crimsonDeep] as const,
  goldBadge: ['#F4D874', gold] as const,
};
