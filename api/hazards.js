const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ ok: false, error: 'Supabase is not configured' });
  }

  try {
    if (req.method === 'GET') {
      const data = await supabaseFetch('/rest/v1/hazards?select=*&order=created_at.asc');
      return res.json({ ok: true, hazards: data.map(fromRow) });
    }

    if (req.method === 'POST') {
      const hazard = sanitizeHazard(req.body || {});
      const data = await supabaseFetch('/rest/v1/hazards', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toRow(hazard)),
      });
      return res.status(201).json({ ok: true, hazard: fromRow(data[0]) });
    }

    if (req.method === 'DELETE') {
      const target = typeof req.query?.target === 'string' ? req.query.target : '';
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!target && !id) return res.status(400).json({ ok: false, error: 'target or id required' });
      const filter = id ? `id=eq.${encodeURIComponent(id)}` : `target=eq.${encodeURIComponent(target)}`;
      await supabaseFetch(`/rest/v1/hazards?${filter}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'hazards api error' });
  }
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || 'Supabase request failed');
  return data;
}

function sanitizeHazard(input) {
  const target = input.target;
  if (!['stairA', 'stairB', 'exitFront', 'exitBack', 'corridor'].includes(target)) {
    throw new Error('bad target');
  }
  const floors = input.floors === 'all' ? 'all' : asFloorArray(input.floors);
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 160) : target;
  return {
    id: typeof input.id === 'string' && input.id ? input.id.slice(0, 80) : `hz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    floors,
    label,
  };
}

function asFloorArray(value) {
  const floors = Array.isArray(value) ? value : [value];
  const clean = floors.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return clean.length ? clean : [1];
}

function toRow(hazard) {
  return { id: hazard.id, target: hazard.target, floors: hazard.floors, label: hazard.label };
}

function fromRow(row) {
  return { id: row.id, target: row.target, floors: row.floors, label: row.label };
}
