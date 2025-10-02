import { getServerSupabase } from './supabaseClientServer.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  const supabase = getServerSupabase();
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const secret = process.env.JWT_SECRET || 'dev_secret';

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
