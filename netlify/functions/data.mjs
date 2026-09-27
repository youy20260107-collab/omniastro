import { getStore } from '@netlify/blobs';
import { requireUser, json } from './_auth.mjs';

const store = getStore('fivelens-data');
const safeKey = (id, key) => `users/${id}/${String(key).replace(/[^a-zA-Z0-9._-]/g, '_')}`;

export default async (req) => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (req.method === 'GET') {
    const key = new URL(req.url).searchParams.get('key');
    if (!key) return json({ error: '缺少 key' }, 400);
    const value = await store.get(safeKey(user.id, key), { type: 'json', consistency: 'strong' });
    return json({ value: value ?? null });
  }
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const body = await req.json().catch(() => null);
  if (!body?.key) return json({ error: '缺少 key' }, 400);
  await store.setJSON(safeKey(user.id, body.key), body.value ?? null);
  return json({ saved: true });
};
