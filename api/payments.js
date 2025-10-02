// Simple in-memory + (optionally) Vercel KV / external DB.
// NOTE: This will reset on each cold start. Replace with persistent storage for production.
let memoryPayments = [];

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ payments: memoryPayments });
  }
  if (req.method === 'PATCH') {
    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ error: 'id & status required' });
    memoryPayments = memoryPayments.map(p => p.id === id ? { ...p, status } : p);
    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
