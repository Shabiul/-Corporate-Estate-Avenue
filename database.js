const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

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
      // sb_secret_... keys are not JWTs, so they go in `apikey` only
      ...(supabaseKey.startsWith('sb_') ? {} : { 'Authorization': `Bearer ${supabaseKey}` }),
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

  // Cheapest possible round trip, used by the health check / keep-alive
  ping: async () => {
    if (!API_URL || !supabaseKey) return unavailable();
    await apiFetch('/inquiries?select=id&limit=1');
    return true;
  },

  getInquiries: async () => {
    if (!API_URL || !supabaseKey) return unavailable();
    const qs = buildQuery({ select: '*', order: 'created_at.desc', limit: 500 });
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
    const qs = buildQuery({ select: '*', order: 'created_at.desc', limit: 300 });
    return apiFetch(`/properties?${qs}`);
  },

  // ---- CRM helpers (all take validated, numeric ids) ----
  getInquiry: async (id) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/inquiries?id=eq.${encodeURIComponent(id)}&select=*`);
    return rows && rows[0] ? rows[0] : null;
  },

  addActivity: async (activity) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch('/crm_activities', { method: 'POST', body: JSON.stringify(activity) });
    return rows && rows[0] ? rows[0] : null;
  },

  getActivities: async (limit = 3000) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const qs = buildQuery({ select: '*', order: 'created_at.desc', limit });
    return apiFetch(`/crm_activities?${qs}`);
  },

  updateInquiry: async (id, patch) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/inquiries?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    return rows ? rows.length : 0;
  },

  bulkUpdateInquiries: async (ids, patch) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/inquiries?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    return rows ? rows.length : 0;
  },

  bulkDeleteInquiries: async (ids) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/inquiries?id=in.(${ids.join(',')})`, { method: 'DELETE' });
    return rows ? rows.length : 0;
  },

  updateProperty: async (id, patch) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/properties?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return rows ? rows.length : 0;
  },

  bulkSetPropertyStatus: async (ids, status) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/properties?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      body: JSON.stringify({ status, approved_at: status === 'approved' ? new Date().toISOString() : null }),
    });
    return rows ? rows.length : 0;
  },

  getApprovedProperties: async (limit = 60) => {
    if (!API_URL || !supabaseKey) return unavailable();
    // Public listing fields only: never owner name, phone or email
    const qs = buildQuery({
      select: 'id,property_type,property_name,property_location,property_bhk,property_price,images,cover_thumb,listing_type,approved_at,featured',
      order: 'featured.desc,approved_at.desc.nullslast',
      limit,
    });
    return apiFetch(`/properties?status=eq.approved&${qs}`);
  },

  setPropertyStatus: async (id, status) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/properties?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, approved_at: status === 'approved' ? new Date().toISOString() : null }),
    });
    return rows ? rows.length : 0;
  },

  deleteProperty: async (id) => {
    if (!API_URL || !supabaseKey) return unavailable();
    const rows = await apiFetch(`/properties?id=eq.${encodeURIComponent(id)}&select=images,cover_thumb`);
    if (!rows || rows.length === 0) return { changes: 0, images: [] };
    await apiFetch(`/properties?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { changes: 1, images: [...(rows[0].images || []), rows[0].cover_thumb].filter(Boolean) };
  },
};

console.log('Supabase REST client ready.');
module.exports = dbHelpers;
