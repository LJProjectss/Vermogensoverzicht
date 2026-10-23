import { useEffect, useState } from 'react';

// Grafiekkleuren in de stijl van het huishoudboekje (marineblauw/inkt, goud, groen, rood).
// Licht en donker apart gekozen en gevalideerd op kleurenblindheid en contrast.
const LIGHT = {
  surface: '#FFFFFF',
  ink: '#0F1B33',
  ink2: '#172033',
  muted: '#5E6B80',
  grid: '#E3E8F0',
  axis: '#CBD3DF',
  line: '#2B64C8',
  series: ['#2563A8', '#C99A3E', '#1B7A4C', '#7A5FB0', '#B5443A'],
};
const DARK = {
  surface: '#111A2B',
  ink: '#EEF2FA',
  ink2: '#E6EBF4',
  muted: '#8D9CB6',
  grid: '#222E47',
  axis: '#33415F',
  line: '#6FA1F2',
  series: ['#4A8AC9', '#BA8829', '#1B7F58', '#8E70D0', '#D2625A'],
};

// categorie -> kleurslot (kleur volgt de categorie, nooit de positie)
export const CAT_SLOT = { cash: 0, beleggingen: 1, pensioen: 2, bezit: 3, schulden: 4 };

export function useChartTheme(theme) {
  return theme === 'dark' ? DARK : LIGHT;
}

// 'auto' volgt de instelling van het systeem (en wisselt live mee)
export function useResolvedTheme(setting) {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [systemDark, setSystemDark] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = (e) => setSystemDark(e.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (setting === 'light' || setting === 'dark') return setting;
  return systemDark ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070D1A' : '#0C1830');
}
