import { getStore } from '@netlify/blobs';
import { requireUser, json } from './_auth.mjs';

const store = getStore('fivelens-data');
const key = (id) => `profiles/${id}`;

export default async (req) => {
  const { user, response } = await requireUser();
  if (response) return response;
  if (req.method === 'GET') {
    const value = await store.get(key(user.id), { type: 'json', consistency: 'strong' });
    return json({ profile: value || null });
  }
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: '資料格式錯誤' }, 400);
  const profile = {
    surname: String(body.surname || '').trim(),
    givenName: String(body.givenName || '').trim(),
    gender: body.gender === 'F' ? 'F' : 'M',
    birthDate: String(body.birthDate || '').trim(),
    birthTime: String(body.birthTime || '').trim(),
    unknownHour: !!body.unknownHour,
    county: String(body.county || '').trim(),
    district: String(body.district || '').trim(),
    longitude: Number(body.longitude),
    latitude: Number(body.latitude),
    timezone: String(body.timezone || 'Asia/Taipei'),
    completedAt: new Date().toISOString(),
    email: user.email || ''
  };
  if (!profile.surname || !profile.givenName || !profile.birthDate || (!profile.birthTime && !profile.unknownHour) || !profile.county || !profile.district) {
    return json({ error: '請完成姓名、出生日期、出生時間（或勾選時辰未知）、出生地資料。' }, 400);
  }
  await store.setJSON(key(user.id), profile);
  return json({ profile, saved: true });
};
