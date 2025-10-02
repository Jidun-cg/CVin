import { getServerSupabase } from './supabaseClientServer.js';
import jwt from 'jsonwebtoken';

async function auth(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    const [, token] = auth.split(' ');
    return jwt.verify(token, secret);
  } catch { return null; }
}

export default async function handler(req, res) {
  const supabase = getServerSupabase();
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  const user = await auth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { id } = req.query || {};
    if (id) {
      const { data, error } = await supabase.from('resumes').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (error || !data) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ resume: data });
    }
    const { data, error } = await supabase.from('resumes').select('id,title,created_at,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ resumes: data });
  }

  if (req.method === 'POST') {
    const { title, data: resumeData, id } = req.body || {};
    if (!title || !resumeData) return res.status(400).json({ error: 'title & data required' });
    if (id) {
      const { error } = await supabase.from('resumes').update({ title, data: resumeData }).eq('id', id).eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, id });
    } else {
      // free plan limit 1
      if (req.headers['x-plan'] === 'free') {
        const { count, error: cntErr } = await supabase.from('resumes').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        if (cntErr) return res.status(500).json({ error: cntErr.message });
        if ((count || 0) >= 1) return res.status(403).json({ error: 'Free plan resume limit reached' });
      }
      const { data, error } = await supabase.from('resumes').insert({ user_id: user.id, title, data: resumeData }).select('id').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, id: data.id });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('resumes').delete().eq('id', id).eq('user_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
