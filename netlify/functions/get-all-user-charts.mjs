import { getStore } from '@netlify/blobs';
import { requireUser, isAdmin, json } from './_auth.mjs';

const store = getStore('fivelens-data');

export default async () => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!isAdmin(user)) return json({ error: '沒有管理權限' }, 403);

  const profileRows = new Map();
  const chartRows = new Map();

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

  const ids = new Set([...profileRows.keys(), ...chartRows.keys()]);
  const rows = Array.from(ids).map(userId => {
    const profile = profileRows.get(userId) || null;
    const charts = chartRows.get(userId) || [];
    const updatedAt = charts.reduce((latest, c) => {
      const t = c?.savedAt || '';
      return t > latest ? t : latest;
    }, profile?.completedAt || '');
    const profileComplete = !!profile && !!profile.surname && !!profile.givenName && !!profile.gender && !!profile.birthDate && (!!profile.birthTime || profile.unknownHour) && !!profile.county && !!profile.district;
    return {
      userId,
      email: profile?.email || '',
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
