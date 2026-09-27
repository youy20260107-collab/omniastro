import { getStore } from '@netlify/blobs';
import { requireUser, isAdmin, json } from './_auth.mjs';
const store = getStore('fivelens-data');
export default async () => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isAdmin(user)) return json({ error: '沒有管理權限' }, 403);
  const { blobs } = await store.list({ prefix: 'users/' });
  const rows = [];
  for (const b of blobs) {
    if (!b.key.endsWith('/savedCharts')) continue;
    const value = await store.get(b.key, { type: 'json' });
    const userId = b.key.split('/')[1] || '';
    if (value) rows.push({ userId, key: 'savedCharts', value });
  }
  return json({ charts: rows });
};
