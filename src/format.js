export function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const parts = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60];
  return (parts[0] ? parts : parts.slice(1)).map((n, i) => (i ? String(n).padStart(2, '0') : n)).join(':');
}
export const length = m => [m >= 60 && `${Math.floor(m / 60)}h`, m % 60 && `${m % 60}m`].filter(Boolean).join(' ');
export const timeOfDay = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
