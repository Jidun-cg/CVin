import { getServerSupabase } from './supabaseClientServer.js';
import jwt from 'jsonwebtoken';
import Busboy from 'busboy';

export const config = { api: { bodyParser: false } };
export const runtime = 'nodejs';

const BUCKET_ENV = process.env.SUPABASE_BUCKET;
const BUCKET_CANDIDATES = [BUCKET_ENV, 'payments', 'payment-proofs'].filter(Boolean);
const TABLE = 'user_payments';

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
    const fields = {}; let fileData = null;
    busboy.on('field', (name, val) => fields[name] = val);
    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', d => chunks.push(d));
      file.on('limit', () => {
        reject(new Error('FILE_TOO_LARGE'));
        file.resume();
      });
      file.on('end', () => {
        fileData = { filename: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) };
      });
    });
    busboy.on('finish', () => resolve({ fields, file: fileData }));
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
    try {
      let query = supabase.from(TABLE).select('*').order('created_at', { ascending: false });
      if (user.role !== 'admin') query = query.eq('user_id', user.id);
      const { data, error } = await query;
      if (error) return respond(res, 500, { error: error.message, stage: 'list' });
      return respond(res, 200, { payments: data });
    } catch (e) {
      console.error('[payments-supabase] GET exception', e);
      return respond(res, 500, { error: 'List failed', stage: 'list-ex' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { fields, file } = await parseMultipart(req);
      if (!file) return respond(res, 400, { error: 'proof required', stage: 'no-file' });
      if (file.buffer.length > 4 * 1024 * 1024) return respond(res, 400, { error: 'File too large (>4MB)', stage: 'size' });
      let selectedBucket = null;
      let lastErr = null;
      for (const candidate of BUCKET_CANDIDATES) {
        const { error: bErr } = await supabase.storage.from(candidate).list('', { limit: 1 });
        if (!bErr) { selectedBucket = candidate; break; }
        lastErr = bErr;
      }
      if (!selectedBucket) {
        // Coba buat bucket pertama kandidat
        const target = BUCKET_CANDIDATES[0];
        const { error: createErr } = await supabase.storage.createBucket(target, { public: true });
        if (createErr) {
          return respond(res, 500, { error: 'All buckets missing & create failed', stage: 'bucket', detail: createErr.message, tried: BUCKET_CANDIDATES });
        }
        selectedBucket = target;
      }
      const filename = `${user.id}-${Date.now()}-${file.filename.replace(/\s+/g,'_')}`;
      const { error: upErr } = await supabase.storage.from(selectedBucket).upload(filename, file.buffer, { contentType: file.mimeType || 'application/octet-stream' });
      if (upErr) return respond(res, 500, { error: upErr.message, stage: 'upload', bucket: selectedBucket });
      const { data: pub } = supabase.storage.from(selectedBucket).getPublicUrl(filename);
      const insertPayload = { user_id: user.id, payment_image: pub.publicUrl, amount: fields.amount ? Number(fields.amount) : 0, method: fields.method || 'dana', status: 'pending' };
      const { data, error } = await supabase.from(TABLE).insert(insertPayload).select().single();
      if (error) return respond(res, 500, { error: error.message, stage: 'insert' });
      return respond(res, 200, { payment: { ...data, bucket: selectedBucket } });
    } catch (e) {
      console.error('[payments-supabase] POST exception', e);
      if (e.message === 'FILE_TOO_LARGE') return respond(res, 400, { error: 'File too large (>4MB)', stage: 'size' });
      return respond(res, 500, { error: 'Upload failed', stage: 'exception' });
    }
  }

  if (req.method === 'PATCH') {
    if (user.role !== 'admin') return respond(res, 403, { error: 'Forbidden' });
    const { id, status } = req.body || {};
    if (!id || !status) return respond(res, 400, { error: 'id & status required' });
    const { error: upErr } = await supabase.from(TABLE).update({ status }).eq('id', id);
    if (upErr) return respond(res, 500, { error: upErr.message, stage: 'update-status' });
    if (status === 'approved') {
      const { data: payData } = await supabase.from(TABLE).select('user_id').eq('id', id).maybeSingle();
      if (payData) await supabase.from('app_users').update({ plan: 'premium' }).eq('id', payData.user_id);
    }
    return respond(res, 200, { success: true });
  }

  return respond(res, 405, { error: 'Method not allowed' });
}
