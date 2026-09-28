import { getStore } from '@netlify/blobs';
import { requireUser, isAdmin, json } from './_auth.mjs';

const store = getStore('fivelens-data');

export default async () => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isAdmin(user)) return json({ error: '沒有管理權限' }, 403);

  const { blobs } = await store.list({ prefix: 'loginlogs/' });
  const rows = [];
  for (const b of blobs) {
    const v = await store.get(b.key, { type: 'json' });
    if (v) rows.push(v);
  }
  rows.sort((a, b) => new Date(b.loginAt || b.ts || 0) - new Date(a.loginAt || a.ts || 0));
  const records = rows.slice(0, 100).map(v => ({
    id: v.id || '',
    ts: v.loginAt || v.ts || '',
    loginAt: v.loginAt || v.ts || '',
    email: v.email || '',
    userId: v.userId || '',
    provider: v.provider || 'Google/Identity',
    name: v.name || ''
  }));
  return json({ records, logs: records });
};
