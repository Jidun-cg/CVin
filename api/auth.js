import { getServerSupabase } from './supabaseClientServer.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Ensure a default admin user exists so manual first-time access can work.
// Controlled by env ENABLE_ADMIN_BOOTSTRAP (default: true). You can override credentials with ADMIN_EMAIL / ADMIN_PASSWORD.
async function ensureAdminUser(supabase) {
  if (process.env.ENABLE_ADMIN_BOOTSTRAP === 'false') return;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@cvin.id';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const forceReset = process.env.ADMIN_FORCE_PASSWORD_RESET === 'true';
  try {
    // Check if any admin exists already
    const { data: existingAdmins, error: adminErr } = await supabase.from('app_users').select('id,email').eq('role', 'admin').limit(1);
    if (adminErr) { console.log('[auth] admin bootstrap: list admins error', adminErr.message); return; }
    if (existingAdmins && existingAdmins.length > 0 && !forceReset) {
      return; // already have at least one admin and not forcing reset
    }
    const { data: existingEmail, error: emailErr } = await supabase.from('app_users').select('*').eq('email', adminEmail).maybeSingle();
    if (emailErr) { console.log('[auth] admin bootstrap: fetch email error', emailErr.message); return; }
    if (!existingEmail) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await supabase.from('app_users').insert({ email: adminEmail, password_hash: hash, role: 'admin', plan: 'premium' });
      console.log('[auth] admin bootstrap: created admin', adminEmail);
    } else {
      const update = { role: 'admin' };
      if (forceReset) {
        update.password_hash = await bcrypt.hash(adminPassword, 10);
        console.log('[auth] admin bootstrap: force password reset for', adminEmail);
      }
      if (!existingEmail.plan) update.plan = 'premium';
      await supabase.from('app_users').update(update).eq('id', existingEmail.id);
    }
  } catch (e) {
    console.log('[auth] admin bootstrap exception', e.message);
  }
}

export default async function handler(req, res) {
  const supabase = getServerSupabase();
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const secret = process.env.JWT_SECRET || 'dev_secret';

  // Best-effort ensure admin exists before processing auth operations
  await ensureAdminUser(supabase);

  if (req.method === 'POST') {
    const { action, email, password } = req.body || {};
    if (!action || !email || !password) return res.status(400).json({ error: 'action, email, password required' });
    if (action === 'signup') {
      const { data: existing } = await supabase.from('app_users').select('id').eq('email', email).maybeSingle();
      if (existing) return res.status(400).json({ error: 'Email already used' });
      const hash = await bcrypt.hash(password, 10);
      const { data, error } = await supabase.from('app_users').insert({ email, password_hash: hash }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      const token = jwt.sign({ id: data.id, email: data.email, role: data.role }, secret, { expiresIn: '7d' });
      return res.status(200).json({ token, user: { id: data.id, email: data.email, role: data.role, plan: data.plan, exportCount: data.export_count } });
    }
    if (action === 'login') {
      const { data, error } = await supabase.from('app_users').select('*').eq('email', email).maybeSingle();
      if (error || !data) return res.status(400).json({ error: 'Invalid credentials' });
      const ok = await bcrypt.compare(password, data.password_hash);
      if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ id: data.id, email: data.email, role: data.role }, secret, { expiresIn: '7d' });
      return res.status(200).json({ token, user: { id: data.id, email: data.email, role: data.role, plan: data.plan, exportCount: data.export_count } });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method === 'GET') {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    try {
      const [, token] = auth.split(' ');
      const payload = jwt.verify(token, secret);
      const { data, error } = await supabase.from('app_users').select('*').eq('id', payload.id).maybeSingle();
      if (error || !data) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ user: { id: data.id, email: data.email, role: data.role, plan: data.plan, exportCount: data.export_count } });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
