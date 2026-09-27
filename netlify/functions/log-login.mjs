import { getStore } from '@netlify/blobs';
import { requireUser, json } from './_auth.mjs';
const store = getStore('fivelens-data');
export default async (req) => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  await store.setJSON(`loginlogs/${id}`, { id, email: user.email || '', userId: user.id, provider: user.app_metadata?.provider || user.appMetadata?.provider || 'Google/Identity', loginAt: new Date().toISOString() });
  return json({ saved: true });
};
