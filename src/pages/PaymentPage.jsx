import React, { useState } from 'react';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PaymentPage() {
  const { submitPayment, user, payments, mode, isPremium } = useAuth();
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [plan, setPlan] = useState('monthly'); // 'monthly' | 'lifetime'
  const [method, setMethod] = useState('dana');

  if (!user) return null;

  const userPayment = payments.find(p => (p.userId === user.id || p.user_id === user.id) && p.status === 'pending');

  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg('Harap pilih file bukti transfer'); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg('Ukuran maksimal 5MB'); return; }
    setLoading(true);
    try {
      const amount = plan === 'monthly' ? 10000 : 50000;
      if (mode === 'remote') {
        await submitPayment(file, { amount, method }); // AuthContext akan panggil paymentsApi.upload
        setMsg('Bukti terkirim (remote). Menunggu verifikasi admin');
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          submitPayment(reader.result); // local base64 (amount/method tidak dipakai di local)
          setMsg('Bukti terkirim (local). Menunggu verifikasi admin');
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error(err);
      setMsg('Upload gagal');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Card>
        <h1 className="text-xl font-semibold mb-4">Upgrade ke Premium</h1>
        <p className="text-sm text-gray-600 mb-4">Lakukan pembayaran manual via Dana ke nomor: <span className="font-medium">087861260156</span> a.n. <span className="font-medium">CVin Digital</span>. Setelah transfer, pilih paket lalu upload bukti untuk diverifikasi.</p>
        {isPremium() && <div className="text-green-600 text-sm mb-4">Anda sudah Premium.</div>}
        {userPayment && <div className="text-sm text-amber-600 mb-4">Pembayaran menunggu verifikasi admin.</div>}
        {!userPayment && !isPremium() && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-sm">
              <label className="mr-3">
                <input type="radio" name="plan" value="monthly" checked={plan==='monthly'} onChange={()=>setPlan('monthly')} />
                <span className="ml-1">Premium Bulanan (Rp 10.000)</span>
              </label>
              <label className="ml-6">
                <input type="radio" name="plan" value="lifetime" checked={plan==='lifetime'} onChange={()=>setPlan('lifetime')} />
                <span className="ml-1">Premium Lifetime (Rp 50.000)</span>
              </label>
            </div>
            <div className="text-sm">
              <label>Metode:</label>
              <select className="ml-2 border rounded px-2 py-1" value={method} onChange={e=>setMethod(e.target.value)}>
                <option value="dana">DANA</option>
                <option value="gopay">GoPay</option>
                <option value="ovo">OVO</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
            <input type="file" accept="image/png,image/jpeg" onChange={e => setFile(e.target.files[0])} />
            <Button disabled={loading}>{loading ? 'Mengunggah...' : 'Upload Bukti'}</Button>
          </form>
        )}
        {msg && <div className="mt-4 text-sm text-primary">{msg}</div>}
        {/* Debug list removed for production cleanliness */}
      </Card>
    </div>
  );
}
