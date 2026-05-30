const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  apikey: SUPABASE_ANON_KEY || '',
  Authorization: `Bearer ${SUPABASE_ANON_KEY || ''}`,
  'Content-Type': 'application/json',
};

export const isCloudSyncEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const getEndpoint = (query = '') => `${SUPABASE_URL}/rest/v1/pos_state${query}`;

export const readCloudState = async () => {
  if (!isCloudSyncEnabled) return {};

  const response = await fetch(getEndpoint('?select=key,value,updated_at'), {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Cloud sync read failed: ${response.status}`);
  }

  const rows = await response.json();
  return rows.reduce((state, row) => {
    state[row.key] = row.value;
    return state;
  }, {});
};

export const writeCloudState = async (entries) => {
  if (!isCloudSyncEnabled || entries.length === 0) return;

  const payload = entries.map(([key, value]) => ({ key, value }));
  const response = await fetch(getEndpoint('?on_conflict=key'), {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Cloud sync write failed: ${response.status}`);
  }
};
