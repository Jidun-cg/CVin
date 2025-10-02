import React, { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { paymentsApi } from '../utils/apiClient.js';

export default function AdminPage() {
  const { users, payments, updatePaymentStatus, mode, user } = useAuth();
  const [remotePayments, setRemotePayments] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;
    if (mode === 'remote' && user?.role === 'admin') {
      const load = async () => {
        setLoading(true); setErr('');
        try {
          const pays = await paymentsApi.list();
          if (active) setRemotePayments(pays.payments || []);
          const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${localStorage.getItem('cvin_token')?.replace(/"/g,'')}` } });
          if (res.ok) {
            const js = await res.json(); if (active) setRemoteUsers(js.users || []);
          }
        } catch (e) {
          if (active) setErr('Gagal memuat data remote');
        } finally { if (active) setLoading(false); }
      };
      load();
    }
    return () => { active = false; };
  }, [mode, user]);

  const usePayments = (mode === 'remote' ? remotePayments : null) || payments;
  const useUsers = (mode === 'remote' ? remoteUsers : users);

  const handleApprove = async (id) => {
    if (mode === 'remote') {
      try { await paymentsApi.update(id, 'approved'); setRemotePayments(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p)); } catch {}
    } else { updatePaymentStatus(id, 'approved'); }
  };
  const handleReject = async (id) => {
    if (mode === 'remote') {
      try { await paymentsApi.update(id, 'rejected'); setRemotePayments(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p)); } catch {}
    } else { updatePaymentStatus(id, 'rejected'); }
  };

  const userMap = Object.fromEntries(useUsers.map(u => [u.id, u]));

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
      <section>
        <h1 className="text-2xl font-semibold mb-4">Admin Panel</h1>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <h3 className="font-semibold mb-2">Statistik Pengguna</h3>
            <p className="text-sm text-gray-600">Total: {useUsers.length}</p>
            <p className="text-sm text-gray-600">Free: {useUsers.filter(u => u.plan === 'free').length}</p>
            <p className="text-sm text-gray-600">Premium: {useUsers.filter(u => u.plan === 'premium').length}</p>
          </Card>
          <Card className="md:col-span-2">
            <h3 className="font-semibold mb-3">Daftar Pengguna</h3>
            <div className="max-h-64 overflow-y-auto text-sm space-y-2 pr-1">
              {useUsers.map(u => (
                <div key={u.id} className="flex justify-between border-b pb-1">
                  <span>{u.email}</span>
                  <span className="capitalize {u.plan==='premium'?'text-primary':''}">{u.plan}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-4">Verifikasi Pembayaran</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {loading && <div className="text-sm text-gray-500">Memuat data pembayaran...</div>}
          {!loading && usePayments.length ? usePayments.map(p => (
            <Card key={p.id}>
              <p className="text-sm mb-2">User: {userMap[p.userId]?.email}</p>
              <p className="text-xs mb-2">Status: <span className="capitalize font-medium">{p.status}</span></p>
              {(p.proof || p.proofUrl) && <img src={p.proof || p.proofUrl} alt="bukti" className="w-full h-40 object-cover rounded mb-3" />}
              <div className="flex gap-2">
                {p.status === 'pending' && (
                  <>
                    <Button onClick={() => handleApprove(p.id)} variant="outline">Approve</Button>
                    <Button onClick={() => handleReject(p.id)} variant="subtle">Reject</Button>
                  </>
                )}
              </div>
            </Card>
          )) : !loading && <div>Tidak ada pembayaran.</div>}
        </div>
      </section>
    </div>
  );
}
