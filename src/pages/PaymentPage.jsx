import React, { useState } from 'react';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PaymentPage() {
  const { submitPayment, user, payments, mode } = useAuth();
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');

  if (!user) return null;

  const userPayment = payments.find(p => p.userId === user.id && p.status === 'pending');

  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg('Harap pilih file bukti transfer'); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg('Ukuran maksimal 5MB'); return; }
    setLoading(true);
    try {
      if (mode === 'remote') {
        await submitPayment(file); // AuthContext akan panggil paymentsApi.upload
        setMsg('Bukti terkirim (remote). Menunggu verifikasi admin');
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          submitPayment(reader.result); // local base64
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
  <p className="text-sm text-gray-600 mb-4">Lakukan pembayaran manual via Dana ke nomor: <span className="font-medium">087861260156</span> a.n. <span className="font-medium">CVin Digital</span>. Setelah transfer, upload bukti untuk diverifikasi.</p>
        {user.plan === 'premium' && <div className="text-green-600 text-sm mb-4">Anda sudah Premium.</div>}
        {userPayment && <div className="text-sm text-amber-600 mb-4">Pembayaran menunggu verifikasi admin.</div>}
        {!userPayment && user.plan !== 'premium' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="file" accept="image/png,image/jpeg" onChange={e => setFile(e.target.files[0])} />
            <Button disabled={loading}>{loading ? 'Mengunggah...' : 'Upload Bukti'}</Button>
          </form>
        )}
        {msg && <div className="mt-4 text-sm text-primary">{msg}</div>}
        {mode==='remote' && payments?.length > 0 && (
          <div className="mt-8 border-t pt-4">
            <h2 className="text-sm font-semibold mb-2">Debug: Payments (remote)</h2>
            <ul className="space-y-2 max-h-64 overflow-y-auto text-xs">
              {payments.slice(0,10).map(p => (
                <li key={p.id} className="border p-2 rounded">
                  <div>ID: {p.id}</div>
                  <div>Status: {p.status}</div>
                  {(p.proof_url || p.proofUrl || p.payment_image) && <a href={p.proof_url || p.proofUrl || p.payment_image} target="_blank" rel="noreferrer" className="text-blue-600 underline">Lihat bukti</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
