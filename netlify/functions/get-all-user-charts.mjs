import { getStore } from '@netlify/blobs';
import { admin } from '@netlify/identity';
import { requireUser, isAdmin, userEmail, json } from './_auth.mjs';

const store = getStore('fivelens-data');

export default async () => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isAdmin(user)) return json({ error: '沒有管理權限' }, 403);

  const profileRows = new Map();
  const chartRows = new Map();
  const identityRows = new Map();

  // 先從 Identity 取得實際會員清單，確保「只有登入過但尚未填完整資料」的會員也會出現在後臺。
  try {
    const result = await admin.listUsers();
    const identities = Array.isArray(result) ? result : (Array.isArray(result?.users) ? result.users : []);
    for (const u of identities) {
      if (!u?.id) continue;
      identityRows.set(u.id, { userId: u.id, email: u.email || u.userMetadata?.email || u.user_metadata?.email || '', name: u.userMetadata?.full_name || u.user_metadata?.full_name || '' });
    }
  } catch (e) {
    console.error('[get-all-user-charts] Identity list failed:', e);
  }

  const profiles = await store.list({ prefix: 'profiles/' });
  for (const b of profiles.blobs) {
    const userId = b.key.slice('profiles/'.length);
    if (!userId) continue;
    const profile = await store.get(b.key, { type: 'json', consistency: 'strong' });
    if (profile) profileRows.set(userId, profile);
  }

  const users = await store.list({ prefix: 'users/' });
  for (const b of users.blobs) {
    const match = /^users\/([^/]+)\/savedCharts$/.exec(b.key);
    if (!match) continue;
    const userId = match[1];
    const value = await store.get(b.key, { type: 'json', consistency: 'strong' });
    const list = Array.isArray(value?.list) ? value.list : (Array.isArray(value) ? value : []);
    chartRows.set(userId, list);
  }

  const ids = new Set([...identityRows.keys(), ...profileRows.keys(), ...chartRows.keys()]);
  const rows = Array.from(ids).map(userId => {
    const identity = identityRows.get(userId) || {};
    const profile = profileRows.get(userId) || null;
    const charts = chartRows.get(userId) || [];
    const updatedAt = charts.reduce((latest, c) => {
      const t = c?.savedAt || '';
      return t > latest ? t : latest;
    }, profile?.completedAt || '');
    const profileComplete = !!profile && !!profile.surname && !!profile.givenName && !!profile.gender && !!profile.birthDate && (!!profile.birthTime || profile.unknownHour) && !!profile.county && !!profile.district;
    return {
      userId,
      email: profile?.email || identity.email || '',
      name: identity.name || '',
      profile,
      profileComplete,
      charts,
      chartCount: charts.length,
      updatedAt
    };
  });

  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return json({ users: rows, charts: rows });
};
