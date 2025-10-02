// Diagnostic endpoint to troubleshoot Supabase payment upload issues
import { getServerSupabase } from './supabaseClientServer.js';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

function auth(req) {
  const authz = req.headers.authorization;
  if (!authz) return null;
  try {
    const [, token] = authz.split(' ');
    const secret = process.env.JWT_SECRET || 'dev_secret';
    return jwt.verify(token, secret);
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = getServerSupabase();
  const user = auth(req);
  const bucket = process.env.SUPABASE_BUCKET || 'payment-proofs';
  const report = { hasSupabase: !!supabase, user: user ? { id: user.id, role: user.role } : null, bucket, env: {} };
  const expose = ['SUPABASE_URL','SUPABASE_SERVICE_KEY','SUPABASE_BUCKET','JWT_SECRET'];
  expose.forEach(k => report.env[k] = process.env[k] ? true : false);
  if (!supabase) return res.status(503).json(report);
  try {
    const { error: listErr } = await supabase.storage.from(bucket).list('', { limit: 1 });
    report.bucketListOk = !listErr;
    if (listErr) report.bucketListError = listErr.message;
  } catch (e) {
    report.bucketListException = String(e);
  }
  try {
    const { data, error } = await supabase.from('app_users').select('id').limit(1);
    report.tableQueryOk = !error;
    if (error) report.tableQueryError = error.message;
    else report.sampleUserCount = data.length;
  } catch (e) { report.tableQueryException = String(e); }
  return res.status(200).json(report);
}
