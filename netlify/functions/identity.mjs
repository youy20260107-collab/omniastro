import { getStore } from '@netlify/blobs';

const store = getStore('fivelens-data');

export default {
  async userLogin(event) {
    const user = event.user;
    if (!user?.id) return;
    const { blobs } = await store.list({ prefix: 'loginlogs/' });
    const cutoff = Date.now() - 30000;
    for (const b of blobs) {
      const v = await store.get(b.key, { type: 'json' });
      if (!v || v.userId !== user.id) continue;
      const t = Date.parse(v.loginAt || v.ts || '');
      if (Number.isFinite(t) && t >= cutoff) return;
    }
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    await store.setJSON(`loginlogs/${id}`, {
      id,
      email: user.email || user.userMetadata?.email || user.user_metadata?.email || '',
      userId: user.id,
      provider: user.appMetadata?.provider || user.app_metadata?.provider || 'Google/Identity',
      loginAt: new Date().toISOString()
    });
  }
};
