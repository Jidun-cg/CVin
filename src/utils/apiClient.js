// Centralized API client for JWT-based endpoints

let token = null;
export function setAuthToken(t) { token = t; }
export function getAuthToken() { return token; }

async function request(url, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export const authApi = {
  async signup(email, password) {
    const res = await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'signup', email, password }) });
    if (!res.ok) throw new Error('Signup gagal');
    return res.json();
  },
  async login(email, password) {
    const res = await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email, password }) });
    if (!res.ok) throw new Error('Login gagal');
    return res.json();
  },
  async profile() {
    const res = await request('/api/auth');
    if (!res.ok) throw new Error('Profile gagal');
    return res.json();
  }
};

export const paymentsApi = {
  async list() {
    const res = await request('/api/payments-supabase');
    if (!res.ok) throw new Error('List payments gagal');
    return res.json();
  },
  async upload(file, { amount = 0, method = 'dana' } = {}) {
    const fd = new FormData();
    fd.append('amount', amount);
    fd.append('method', method);
    fd.append('proof', file);
    const res = await fetch('/api/payments-supabase', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Upload gagal');
    return res.json();
  },
  async update(id, status) {
    const res = await request('/api/payments-supabase', { method: 'PATCH', body: JSON.stringify({ id, status }) });
    if (!res.ok) throw new Error('Update gagal');
    return res.json();
  }
};

export const resumesApi = {
  async list() {
    const res = await request('/api/resumes');
    if (!res.ok) throw new Error('List resumes gagal');
    return res.json();
  },
  async get(id) {
    const res = await request(`/api/resumes?id=${id}`);
    if (!res.ok) throw new Error('Get resume gagal');
    return res.json();
  },
  async save({ id, title, data, plan }) {
    const res = await request('/api/resumes', { method: 'POST', headers: { 'X-Plan': plan }, body: JSON.stringify({ id, title, data }) });
    if (!res.ok) throw new Error('Save resume gagal');
    return res.json();
  },
  async remove(id) {
    const res = await request(`/api/resumes?id=${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Hapus resume gagal');
    return res.json();
  }
};
