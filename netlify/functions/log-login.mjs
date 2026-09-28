import { getStore } from '@netlify/blobs';
import { requireUser, userEmail, json } from './_auth.mjs';

const store = getStore('fivelens-data');

export default async (req) => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const email = userEmail(user);
  const { blobs } = await store.list({ prefix: 'loginlogs/' });
  const cutoff = Date.now() - 30000;
  for (const b of blobs) {
    const v = await store.get(b.key, { type: 'json' });
    if (!v || v.userId !== user.id) continue;
    const t = Date.parse(v.loginAt || v.ts || '');
    if (Number.isFinite(t) && t >= cutoff) return json({ saved: true, duplicate: true, record: v });
  }

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const record = {
    id,
    email,
    userId: user.id,
    provider: user.appMetadata?.provider || user.app_metadata?.provider || 'Google/Identity',
    loginAt: new Date().toISOString()
  };
  await store.setJSON(`loginlogs/${id}`, record);
  return json({ saved: true, record });
};
