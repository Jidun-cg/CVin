import React, { useEffect, useMemo, useState } from 'react';
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

  // Filters & derived groups
  const [statusFilter, setStatusFilter] = useState('all');
  const filteredPayments = useMemo(() => {
    if (!usePayments) return [];
    if (statusFilter === 'all') return usePayments;
    return usePayments.filter(p => p.status === statusFilter);
  }, [usePayments, statusFilter]);

  const totals = useMemo(() => {
    const base = { pending: 0, approved: 0, rejected: 0 };
    usePayments.forEach(p => { base[p.status] = (base[p.status]||0) + 1; });
    return base;
  }, [usePayments]);

  const handleApprove = async (id) => {
    if (!window.confirm('Approve pembayaran ini?')) return;
    if (mode === 'remote') {
      try {
        await paymentsApi.update(id, 'approved');
        await refreshRemote();
      } catch {}
    } else {
      updatePaymentStatus(id, 'approved');
    }
  };
  const handleReject = async (id) => {
    if (!window.confirm('Tolak pembayaran ini?')) return;
    if (mode === 'remote') {
      try {
        await paymentsApi.update(id, 'rejected');
        await refreshRemote();
      } catch {}
    } else {
      updatePaymentStatus(id, 'rejected');
    }
  };

  const userMap = Object.fromEntries(useUsers.map(u => [u.id, u]));
  const refreshRemote = async () => {
    if (mode === 'remote' && user?.role === 'admin') {
      try {
        const pays = await paymentsApi.list();
        setRemotePayments(pays.payments || []);
      } catch {}
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
      <section>
        <h1 className="text-2xl font-semibold mb-4">Admin Panel</h1>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <h3 className="font-semibold mb-2">Statistik Pengguna</h3>
            <div className="text-xs space-y-1">
              <p>Total: {useUsers.length}</p>
              <p>Free: {useUsers.filter(u => u.plan === 'free').length}</p>
              <p>Premium: {useUsers.filter(u => u.plan === 'premium').length}</p>
              <p className="mt-2">Total Pembayaran: {usePayments.length}</p>
            </div>
          </Card>
          <Card className="md:col-span-2">
            <h3 className="font-semibold mb-3">Daftar Pengguna</h3>
            <div className="max-h-64 overflow-y-auto text-sm space-y-2 pr-1">
              {useUsers.map(u => (
                <div key={u.id} className="flex justify-between items-center border-b pb-1">
                  <span>{u.email}</span>
                  <span className={"capitalize text-xs px-2 py-0.5 rounded-full " + (u.plan === 'premium' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600')}>{u.plan}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Verifikasi Pembayaran</h2>
          <div className="flex items-center gap-4">
            <div className="flex gap-1 text-xs">
              <button onClick={()=>setStatusFilter('all')} disabled={loading} className={`px-2 py-0.5 rounded ${statusFilter==='all'?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'} ${loading?'opacity-50 pointer-events-none':''}`}>All ({usePayments.length})</button>
              <button onClick={()=>setStatusFilter('pending')} disabled={loading} className={`px-2 py-0.5 rounded ${statusFilter==='pending'?'bg-yellow-500 text-white':'bg-gray-100 text-gray-600'} ${loading?'opacity-50 pointer-events-none':''}`}>Pending ({totals.pending})</button>
              <button onClick={()=>setStatusFilter('approved')} disabled={loading} className={`px-2 py-0.5 rounded ${statusFilter==='approved'?'bg-green-600 text-white':'bg-gray-100 text-gray-600'} ${loading?'opacity-50 pointer-events-none':''}`}>Approved ({totals.approved})</button>
              <button onClick={()=>setStatusFilter('rejected')} disabled={loading} className={`px-2 py-0.5 rounded ${statusFilter==='rejected'?'bg-red-600 text-white':'bg-gray-100 text-gray-600'} ${loading?'opacity-50 pointer-events-none':''}`}>Rejected ({totals.rejected})</button>
            </div>
            {mode==='remote' && <button onClick={refreshRemote} disabled={loading} className={`text-sm text-blue-600 underline ${loading?'opacity-50 pointer-events-none':''}`}>Refresh</button>}
          </div>
        </div>
        {err && <div className="mb-4 text-sm text-red-600">{err}</div>}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading && <div className="text-sm text-gray-500">Memuat data pembayaran...</div>}
          {!loading && filteredPayments.length ? filteredPayments.map(p => {
            const img = p.proof || p.proofUrl || p.proof_url || p.payment_image;
            const userEmail = userMap[p.userId || p.user_id]?.email;
            return (
              <Card key={p.id}>
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-medium truncate max-w-[60%]">{userEmail || <span className="text-red-500">Unknown user</span>}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${p.status==='approved'?'bg-green-100 text-green-700':p.status==='rejected'?'bg-red-100 text-red-600': 'bg-yellow-100 text-yellow-700'}`}>{p.status}</span>
                </div>
                {img && <img src={img} alt="bukti" className="w-full h-32 object-cover rounded mb-3" />}
                <div className="text-[11px] text-gray-600 space-y-1 mb-3">
                  {'amount' in p && <p>Amount: <span className="font-medium">{p.amount || 0}</span></p>}
                  {'method' in p && <p>Method: <span className="font-medium uppercase">{p.method}</span></p>}
                  {p.created_at && <p>Created: {new Date(p.created_at).toLocaleString()}</p>}
                </div>
                {p.status === 'pending' && (
                  <div className="flex gap-2 text-xs">
                    <Button onClick={() => handleApprove(p.id)} variant="outline">Approve</Button>
                    <Button onClick={() => handleReject(p.id)} variant="subtle">Reject</Button>
                  </div>
                )}
              </Card>
            );
          }) : !loading && <div className="col-span-full text-sm text-gray-500">Tidak ada pembayaran.</div>}
        </div>
      </section>
    </div>
  );
}
