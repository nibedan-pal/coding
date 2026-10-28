export function rupees(n) {
  const v = Math.round(Number(n || 0));
  return '₹' + v.toLocaleString('en-IN');
}

export function orderNo(o) {
  return 'LK' + o.order_no;
}

export function timeText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${hm}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + hm;
}

export const STATUS = {
  placed: { label: 'Waiting for shop', tone: 'warn' },
  accepted: { label: 'Shop is packing', tone: 'warn' },
  packed: { label: 'Packed', tone: 'warn' },
  picked_up: { label: 'On the way', tone: 'good' },
  delivered: { label: 'Delivered', tone: 'good' },
  rejected: { label: 'Rejected by shop', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
};

export function itemsLine(items) {
  return (items || []).map((i) => `${i.qty}× ${i.name}`).join(', ');
}

// Same formula as the server, used only to show an estimate before ordering
export function distanceKm(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 100) / 100;
}
