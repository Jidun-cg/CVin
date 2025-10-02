import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from '../utils/storage.js';
import { genId } from '../utils/localDb.js';
import { authApi, paymentsApi, resumesApi, setAuthToken } from '../utils/apiClient.js';

const AuthContext = createContext(null);

const USERS_KEY = 'cvin_users';
const SESSION_KEY = 'cvin_session';
const PAYMENTS_KEY = 'cvin_payments';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]); // local legacy only (for admin stats when no backend)
  const [payments, setPayments] = useState([]); // legacy local payments
  const [remotePayments, setRemotePayments] = useState(null);
  const [remoteResumes, setRemoteResumes] = useState(null);
  const [mode, setMode] = useState('local'); // 'local' | 'remote'

  useEffect(() => {
    // Detect remote mode if token present in storage
    const token = loadJSON('cvin_token', null);
    if (token) setAuthToken(token);
    (async () => {
      try {
        const prof = token ? await authApi.profile() : null;
        if (prof?.user) { setUser(prof.user); setMode('remote'); }
      } catch {
        // fallback to local
      }
      if (mode === 'local') {
        let legacyUsers = loadJSON(USERS_KEY, []);
        if (!legacyUsers.find(x => x.role === 'admin')) {
          legacyUsers.push({ id: 'admin-user', email: 'admin@cvin.id', password: 'admin123', role: 'admin', plan: 'premium', cvs: [], exportCount: 0 });
        }
        setUsers(legacyUsers);
        setPayments(loadJSON(PAYMENTS_KEY, []));
        const session = loadJSON(SESSION_KEY, null);
        if (session) {
          const found = legacyUsers.find(u => u.id === session.id);
          if (found) setUser(found);
        }
      } else {
        // remote fetch payments & resumes lazily on demand
        // (leave empty here to reduce initial load)
      }
    })();
  }, [mode]);

  useEffect(() => { if (mode === 'local') saveJSON(USERS_KEY, users); }, [users, mode]);
  useEffect(() => { if (mode === 'local') saveJSON(PAYMENTS_KEY, payments); }, [payments, mode]);
  useEffect(() => { if (mode === 'local') saveJSON(SESSION_KEY, user); }, [user, mode]);

  const signup = async (email, password) => {
    // Always try remote first; fallback to local if unreachable or misconfigured
    try {
      const { token, user: remoteUser } = await authApi.signup(email, password);
      setAuthToken(token); saveJSON('cvin_token', token);
      setUser(remoteUser); setMode('remote');
      return;
    } catch (e) {
      // console.warn('Remote signup failed, fallback to local', e);
    }
    if (users.find(u => u.email === email)) throw new Error('Email sudah terdaftar (local)');
    const newUser = { id: genId('u'), email, password, role: 'user', plan: 'free', cvs: [], exportCount: 0 };
    setUsers(prev => [...prev, newUser]);
    setUser(newUser);
  };

  const login = async (email, password) => {
    // Try remote first even if currently in local mode
    try {
      const { token, user: remoteUser } = await authApi.login(email, password);
      setAuthToken(token); saveJSON('cvin_token', token);
      setUser(remoteUser); setMode('remote');
      return;
    } catch (e) {
      // ignore and fallback
    }
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) throw new Error('Email atau password salah (local)');
    setUser(found);
  };

  const logout = () => { setUser(null); setAuthToken(null); saveJSON('cvin_token', null); };

  const submitPayment = async (proofFileOrDataUrl) => {
    if (!user) return;
    if (mode === 'remote') {
      // expects File object
      if (proofFileOrDataUrl instanceof File) {
        try { await paymentsApi.upload(proofFileOrDataUrl); } catch (e) { console.error(e); }
      }
    } else {
      const payment = { id: genId('pay'), userId: user.id, status: 'pending', proof: proofFileOrDataUrl, createdAt: Date.now(), method: 'dana' };
      setPayments(prev => [payment, ...prev]);
    }
  };

  const updatePaymentStatus = async (paymentId, status) => {
    if (mode === 'remote') {
      try { await paymentsApi.update(paymentId, status); } catch (e) { console.error(e); }
      // re-fetch payments list lazily
      return;
    }
    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status } : p));
    if (status === 'approved') {
      const pay = payments.find(p => p.id === paymentId);
      if (pay) {
        setUsers(prev => prev.map(u => u.id === pay.userId ? { ...u, plan: 'premium' } : u));
        setUser(prev => prev && prev.id === pay.userId ? { ...prev, plan: 'premium' } : prev);
      }
    }
  };

  const canCreateCV = () => {
    if (!user) return false;
    if (user.plan === 'premium') return true;
    if (mode === 'remote') {
      const count = remoteResumes?.length || 0;
      return count < 1;
    }
    return (user.cvs?.length || 0) < 1; // local free limit
  };

  const saveCV = async (cvData, existingId) => {
    if (!user) return;
    if (!existingId && !canCreateCV()) throw new Error('Limit CV untuk akun Free tercapai. Upgrade ke Premium.');
    if (mode === 'remote') {
      try {
        const resp = await resumesApi.save({ id: existingId, title: cvData.title || 'Untitled', data: cvData, plan: user.plan });
        // refresh list
        const list = await resumesApi.list();
        setRemoteResumes(list.resumes || []);
        return resp.id || existingId;
      } catch (e) { console.error(e); }
      return;
    }
    setUsers(prev => prev.map(u => {
      if (u.id !== user.id) return u;
      let cvs = [...(u.cvs||[])];
      if (existingId) {
        cvs = cvs.map(c => c.id === existingId ? { ...c, ...cvData, updatedAt: Date.now() } : c);
      } else {
        cvs.push({ id: genId('cv'), ...cvData, createdAt: Date.now(), updatedAt: Date.now() });
      }
      return { ...u, cvs };
    }));
  };

  const duplicateCV = (id) => {
    if (!user) return;
    setUsers(prev => prev.map(u => {
      if (u.id !== user.id) return u;
      const original = u.cvs.find(c => c.id === id);
      if (!original) return u;
      return { ...u, cvs: [...u.cvs, { ...original, id: crypto.randomUUID(), title: original.title + ' (Copy)', createdAt: Date.now(), updatedAt: Date.now() }] };
    }));
  };

  const canExport = (format) => {
    if (!user) return false;
    if (user.plan === 'premium') return true;
    if (format === 'docx') return false;
    return (user.exportCount || 0) < 3;
  };

  const incrementExport = () => {
    if (!user) return;
    if (user.plan === 'premium') return;
    // Only local for now; remote could call an API to increment
    if (mode === 'local') {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, exportCount: (u.exportCount || 0) + 1 } : u));
      setUser(prev => prev ? { ...prev, exportCount: (prev.exportCount || 0) + 1 } : prev);
    }
  };

  const value = {
    user,
    users,
    payments: remotePayments || payments,
    mode,
    login,
    signup,
    logout,
    submitPayment,
    updatePaymentStatus,
    saveCV,
    duplicateCV,
    canCreateCV,
    canExport,
    incrementExport
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
