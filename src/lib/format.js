const NUMBER = new Intl.NumberFormat('tr-TR');
const TIME = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const DATETIME = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export const num = (value) => NUMBER.format(Number(value) || 0);

export const clock = (value) => (value ? TIME.format(new Date(value)) : '—');

export const stamp = (value) => (value ? DATETIME.format(new Date(value)) : '—');

export function since(value) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'az önce';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

/** Denetim kaydı ts'i epoch ms; eski kayıtlarda created_at/at da olabilir. */
export function logTime(entry) {
  const raw = entry?.ts ?? entry?.created_at ?? entry?.at;
  if (!raw) return '';
  const date = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : stamp(date);
}
