// Client helper for payment API

export async function apiUploadPayment({ userId, amount = 0, method = 'dana', file }) {
  const fd = new FormData();
  fd.append('userId', userId);
  fd.append('amount', amount);
  fd.append('method', method);
  fd.append('proof', file);
  const res = await fetch('/api/upload-payment', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Gagal upload bukti');
  return res.json();
}

export async function apiListPayments() {
  const res = await fetch('/api/payments');
  if (!res.ok) throw new Error('Gagal ambil payments');
  return res.json();
}

export async function apiUpdatePayment(id, status) {
  const res = await fetch('/api/payments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
  if (!res.ok) throw new Error('Gagal update status');
  return res.json();
}
