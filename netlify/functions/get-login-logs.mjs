import { getStore } from '@netlify/blobs';
import { requireUser, isAdmin, json } from './_auth.mjs';
const store = getStore('fivelens-data');
export default async () => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isAdmin(user)) return json({ error: '沒有管理權限' }, 403);
  const { blobs } = await store.list({ prefix: 'loginlogs/' });
  const rows = [];
  for (const b of blobs.slice(-200)) {
    const v = await store.get(b.key, { type: 'json' });
    if (v) rows.push(v);
  }
  rows.sort((a,b) => new Date(b.loginAt) - new Date(a.loginAt));
  return json({ logs: rows.slice(0, 100) });
};
