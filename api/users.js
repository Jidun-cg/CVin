import { getServerSupabase } from './supabaseClientServer.js';
import jwt from 'jsonwebtoken';

function auth(req) {
  const auth = req.headers.authorization; if (!auth) return null;
  try {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    const [, token] = auth.split(' ');
    return jwt.verify(token, secret);
  } catch { return null; }
}

export default async function handler(req, res) {
  const supabase = getServerSupabase();
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const user = auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { data, error } = await supabase.from('app_users').select('id,email,plan,role,export_count');
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ users: data });
}
