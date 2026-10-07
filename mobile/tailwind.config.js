/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        rwnavy: '#0B1E45',
        rwnavydeep: '#071433',
        rwnavylight: '#16295E',
        rwnavymist: '#EAF0FB',
        rwcrimson: '#E11D3C',
        rwcrimsondeep: '#B0102B',
        rwcrimsonmist: '#FDEBEE',
        rwamber: '#F59E0B',
        rwteal: '#0D9488',
        rwgold: '#D4AF37',
        rwblue: '#2563EB',
        rwtext: '#0F172A',
        rwmuted: '#64748B',
        rwbg: '#F3F5FA',
        rwborder: 'rgba(15,30,77,0.10)',
      },
      fontFamily: {
        head: ['SpaceGrotesk_600SemiBold'],
        headbold: ['SpaceGrotesk_700Bold'],
        body: ['DMSans_400Regular'],
        bodymed: ['DMSans_500Medium'],
        bodysemi: ['DMSans_700Bold'],
      },
    },
  },
  plugins: [],
};
