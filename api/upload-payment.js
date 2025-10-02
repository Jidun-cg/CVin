// LEGACY ENDPOINT (Deprecated)
// Aplikasi sekarang memakai /api/payments-supabase dengan Authorization Bearer token.
// Endpoint ini dipertahankan sementara agar tidak langsung 500 jika masih ada client lama.
import { put } from '@vercel/blob';

let memoryPayments = [];

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Jika request sudah membawa Authorization (token baru), arahkan user untuk pakai endpoint baru.
  if (req.headers.authorization) {
    return res.status(410).json({
      error: 'Endpoint deprecated',
      message: 'Gunakan /api/payments-supabase dengan FormData dan header Authorization Bearer token.'
    });
  }
  try {
    const { fields, files } = await parseMultipart(req);
    const userId = fields.userId;
    const amount = Number(fields.amount || 0);
    const method = fields.method || 'dana';
    const file = files.proof;
    if (!userId || !file) return res.status(400).json({ error: 'userId & proof wajib (legacy)' });

    // Simpan ke blob (legacy) – tidak masuk Supabase.
    const blob = await put(`payments/${Date.now()}-${file.originalFilename}`, file.buffer, { access: 'public' });
    const record = { id: crypto.randomUUID(), userId, amount, method, proofUrl: blob.url, status: 'pending', createdAt: new Date().toISOString() };
    memoryPayments.unshift(record);
    return res.status(200).json({ success: true, payment: record, legacy: true });
  } catch (e) {
    console.error('[upload-payment legacy error]', e);
    res.status(500).json({ error: 'Upload gagal (legacy)' });
  }
}

import Busboy from 'busboy';
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {}; const files = {};
    busboy.on('field', (name, val) => fields[name] = val);
    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', d => chunks.push(d));
      file.on('end', () => {
        files[name] = { fieldName: name, originalFilename: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) };
      });
    });
    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
