const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  apikey: SUPABASE_ANON_KEY || '',
  Authorization: `Bearer ${SUPABASE_ANON_KEY || ''}`,
  'Content-Type': 'application/json',
};

export const isCloudSyncEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const getEndpoint = (query = '') => `${SUPABASE_URL}/rest/v1/pos_state${query}`;
const getUsersEndpoint = (query = '') => `${SUPABASE_URL}/rest/v1/pos_users${query}`;

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

// User Management Functions
export const readUsersFromCloud = async () => {
  if (!isCloudSyncEnabled) return [];

  const response = await fetch(getUsersEndpoint('?select=id,name,email,role,status,created_at'), {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to read users: ${response.status}`);
  }

  return await response.json();
};

export const getUserByEmail = async (email) => {
  if (!isCloudSyncEnabled) return null;

  const response = await fetch(getUsersEndpoint(`?email=eq.${encodeURIComponent(email)}&select=id,name,email,role,status,password_hash`), {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get user: ${response.status}`);
  }

  const users = await response.json();
  return users.length > 0 ? users[0] : null;
};

export const createUser = async (name, email, passwordHash) => {
  if (!isCloudSyncEnabled) return null;

  const response = await fetch(getUsersEndpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      email,
      password_hash: passwordHash,
      role: null,
      status: 'pending'
    }),
  });

  if (!response.ok) {
    // Try to parse body for a helpful message
    let errBody = null;
    try {
      errBody = await response.json();
    } catch (e) {
      // ignore parse errors
    }

    const detail = errBody && (errBody.message || errBody.error || errBody.detail || JSON.stringify(errBody));

    // Supabase may return 409 or include keywords for duplicate records
    const isDuplicate = response.status === 409 || (detail && /duplicate|already exists|unique/i.test(detail));

    if (isDuplicate) {
      throw new Error('duplicate');
    }

    const msg = detail || response.statusText || `status:${response.status}`;
    throw new Error(msg);
  }

  return await response.json();
};

export const updateUser = async (email, updates) => {
  if (!isCloudSyncEnabled) return null;

  const response = await fetch(getUsersEndpoint(`?email=eq.${encodeURIComponent(email)}`), {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    let errBody = null;
    try {
      errBody = await response.json();
    } catch (e) {
      // ignore parse errors
    }

    const detail = errBody && (errBody.message || errBody.error || errBody.detail || JSON.stringify(errBody));
    throw new Error(detail || `Failed to update user: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }

  return { success: true };
};

export const deleteUser = async (email) => {
  if (!isCloudSyncEnabled) return null;

  const response = await fetch(getUsersEndpoint(`?email=eq.${encodeURIComponent(email)}`), {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    let errBody = null;
    try {
      errBody = await response.json();
    } catch (e) {
      // ignore parse errors
    }

    const detail = errBody && (errBody.message || errBody.error || errBody.detail || JSON.stringify(errBody));
    throw new Error(detail || `Failed to delete user: ${response.status}`);
  }

  return { success: true };
};

export const verifyPassword = (inputPassword, storedHash) => {
  // Simple comparison - in production, use bcrypt or similar
  // For now, we're storing plain text but marking for upgrade
  return inputPassword === storedHash;
};
