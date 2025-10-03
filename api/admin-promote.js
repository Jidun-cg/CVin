import { getServerSupabase } from './supabaseClientServer.js';
import bcrypt from 'bcryptjs';

/*
  Temporary endpoint to promote / create an admin user.
  Usage: POST /api/admin-promote  { "email": "admin@cvin.id", "password": "admin123", "secret": "<PROMOTE_SECRET>" }

  Security:
    - Requires env ADMIN_PROMOTE_SECRET to match body.secret exactly.
    - Only intended for one-time setup; remove or disable after use.

  Behavior:
    1. If user with email not found => creates user with given password, role=admin, plan=premium.
    2. If user exists => updates role to admin (and optionally resets password if provided).
*/

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = getServerSupabase();
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

  const { email, password, secret } = req.body || {};
  if (!email || !secret) return res.status(400).json({ error: 'email & secret required' });
  if (secret !== process.env.ADMIN_PROMOTE_SECRET) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { data: existing, error: selErr } = await supabase.from('app_users').select('*').eq('email', email).maybeSingle();
    if (selErr) return res.status(500).json({ error: selErr.message, stage: 'select' });

    if (!existing) {
      if (!password) return res.status(400).json({ error: 'password required to create new admin' });
      const hash = await bcrypt.hash(password, 10);
      const { data: created, error: insErr } = await supabase.from('app_users').insert({ email, password_hash: hash, role: 'admin', plan: 'premium' }).select().single();
      if (insErr) return res.status(500).json({ error: insErr.message, stage: 'insert' });
      return res.status(200).json({ created: true, updated: false, user: { id: created.id, email: created.email, role: created.role, plan: created.plan } });
    }

    // Update existing user
    const patch = { role: 'admin' };
    if (password) {
      patch.password_hash = await bcrypt.hash(password, 10);
    }
    if (!existing.plan || existing.plan === 'free') patch.plan = 'premium';
    const { error: upErr } = await supabase.from('app_users').update(patch).eq('id', existing.id);
    if (upErr) return res.status(500).json({ error: upErr.message, stage: 'update' });
    return res.status(200).json({ created: false, updated: true });
  } catch (e) {
    return res.status(500).json({ error: 'exception', detail: e.message });
  }
}
