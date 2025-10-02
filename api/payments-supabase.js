import { getServerSupabase } from './supabaseClientServer.js';
import Busboy from 'busboy';
import jwt from 'jsonwebtoken';

export const config = { api: { bodyParser: false } };

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {}; const files = {};
    busboy.on('field', (name, val) => fields[name] = val);
    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', d => chunks.push(d));
      file.on('end', () => { files[name] = { filename: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) }; });
    });
    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

function respond(res, code, body) { res.status(code).json(body); }

async function authUser(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [, token] = auth.split(' ');
  try {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    const payload = jwt.verify(token, secret);
    return payload; // { id, email, role }
  } catch { return null; }
}

export default async function handler(req, res) {
  const supabase = getServerSupabase();
  if (!supabase) return respond(res, 503, { error: 'Supabase not configured' });
  const user = await authUser(req);
  if (!user) return respond(res, 401, { error: 'Unauthorized' });

  if (req.method === 'GET') {
    // Admin can see all; normal user sees own
    let query = supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (user.role !== 'admin') query = query.eq('user_id', user.id);
    const { data, error } = await query;
    if (error) return respond(res, 500, { error: error.message });
    return respond(res, 200, { payments: data });
  }

  if (req.method === 'POST') {
    try {
      const { fields, files } = await parseMultipart(req);
      const file = files.proof;
      if (!file) return respond(res, 400, { error: 'proof required' });
      const bucket = process.env.SUPABASE_BUCKET || 'payment-proofs';
      const filename = `${user.id}-${Date.now()}-${file.filename}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(filename, file.buffer, { contentType: file.mimeType });
      if (upErr) return respond(res, 500, { error: upErr.message });
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filename);
      const { data, error } = await supabase.from('payments').insert({ user_id: user.id, amount: fields.amount ? Number(fields.amount) : 0, method: fields.method || 'dana', proof_url: pub.publicUrl }).select().single();
      if (error) return respond(res, 500, { error: error.message });
      return respond(res, 200, { payment: data });
    } catch (e) {
      return respond(res, 500, { error: 'Upload failed' });
    }
  }

  if (req.method === 'PATCH') {
    if (user.role !== 'admin') return respond(res, 403, { error: 'Forbidden' });
    const { id, status } = req.body || {};
    if (!id || !status) return respond(res, 400, { error: 'id & status required' });
    const { error: upErr } = await supabase.from('payments').update({ status }).eq('id', id);
    if (upErr) return respond(res, 500, { error: upErr.message });
    if (status === 'approved') {
      // fetch payment to get owner
      const { data: payData, error: payErr } = await supabase.from('payments').select('user_id').eq('id', id).maybeSingle();
      if (!payErr && payData) {
        await supabase.from('app_users').update({ plan: 'premium' }).eq('id', payData.user_id);
      }
    }
    return respond(res, 200, { success: true });
  }

  return respond(res, 405, { error: 'Method not allowed' });
}
