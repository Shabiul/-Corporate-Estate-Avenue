const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const API_URL = supabaseUrl ? `${supabaseUrl}/rest/v1` : null;

function unavailable() {
  return Promise.reject(new Error('Database is not available in this environment.'));
}

async function apiFetch(path, options = {}) {
  if (!API_URL || !supabaseKey) throw new Error('Supabase not configured');
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API error (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function buildQuery(params) {
  const q = new URLSearchParams();
  if (params.select) q.set('select', params.select);
  if (params.order) q.set('order', params.order);
  if (params.limit) q.set('limit', params.limit);
    return q.toString();
}

const dbHelpers = {
  saveInquiry: async (inquiry) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const data = await apiFetch('/inquiries', {
      method: 'POST',
      body: JSON.stringify(inquiry),
    });
    return data?.[0]?.id;
  },

  getInquiries: async () => {
    if (!API_URL || !supabaseKey) return unavailable();
    const qs = buildQuery({ select: '*', order: 'created_at.desc' });
    return apiFetch(`/inquiries?${qs}`);
  },

  deleteInquiry: async (id) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/inquiries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return rows ? rows.length : 0;
  },

  saveProperty: async (property) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const data = await apiFetch('/properties', {
      method: 'POST',
      body: JSON.stringify(property),
    });
    return data?.[0]?.id;
  },

  getProperties: async () => {
    if (!API_URL || !supabaseKey) return unavailable();
    const qs = buildQuery({ select: '*', order: 'created_at.desc' });
    return apiFetch(`/properties?${qs}`);
  },

  deleteProperty: async (id) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/properties?id=eq.${encodeURIComponent(id)}&select=images`);
    if (!rows || rows.length === 0) return { changes: 0, images: [] };
    await apiFetch(`/properties?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { changes: 1, images: rows[0].images || [] };
  },
};

console.log('Supabase REST client ready.');
module.exports = dbHelpers;
