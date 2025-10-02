import { getServerSupabase } from './supabaseClientServer.js';
import jwt from 'jsonwebtoken';
import { IncomingForm } from 'formidable';
import fs from 'fs/promises';

// Nonaktifkan bodyParser dan tetapkan size limit < 4MB
export const config = { api: { bodyParser: false, sizeLimit: '4mb' } };
export const runtime = 'nodejs';

const BUCKET = process.env.SUPABASE_BUCKET || 'payments';
const TABLE = 'user_payments'; // tabel baru sesuai requirement

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false, maxFileSize: 4 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
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
      const { fields, files } = await parseForm(req);
      const fileObj = files.proof || files.file || files.image;
      if (!fileObj) return respond(res, 400, { error: 'proof required', stage: 'no-file' });
      const single = Array.isArray(fileObj) ? fileObj[0] : fileObj;
      const filePath = single.filepath || single.file || single.path;
      const originalName = single.originalFilename || single.newFilename || 'upload.bin';
      const mimeType = single.mimetype || 'application/octet-stream';
      const buffer = await fs.readFile(filePath);
      if (buffer.length > 4 * 1024 * 1024) return respond(res, 400, { error: 'File too large (>4MB)', stage: 'size' });

      // Ensure bucket exists
      const { error: bucketErr } = await supabase.storage.from(BUCKET).list('', { limit: 1 });
      if (bucketErr && bucketErr.message?.toLowerCase().includes('not found')) {
        const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
        if (createErr) return respond(res, 500, { error: 'Bucket create failed', stage: 'bucket-create', bucket: BUCKET });
      } else if (bucketErr) {
        return respond(res, 500, { error: bucketErr.message, stage: 'bucket-check', bucket: BUCKET });
      }

      const filename = `${user.id}-${Date.now()}-${originalName.replace(/\s+/g,'_')}`;
      console.log('[payments-supabase] Upload start', { user: user.id, filename, size: buffer.length });
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType: mimeType, upsert: false });
      if (upErr) return respond(res, 500, { error: upErr.message, stage: 'upload', bucket: BUCKET });
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      const record = { user_id: user.id, amount: fields.amount ? Number(fields.amount) : 0, method: fields.method || 'dana', payment_image: pub.publicUrl, status: 'pending' };
      const { data, error } = await supabase.from(TABLE).insert(record).select().single();
      if (error) return respond(res, 500, { error: error.message, stage: 'insert' });
      return respond(res, 200, { payment: data });
    } catch (e) {
      console.error('[payments-supabase] POST exception', e);
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
