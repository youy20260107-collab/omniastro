import { getUser } from '@netlify/identity';

export async function requireUser() {
  const user = await getUser();
  if (!user) return { user: null, response: new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers: { 'content-type': 'application/json' } }) };
  return { user, response: null };
}

export function isAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return email === 'felix670131@gmail.com' || (Array.isArray(user?.roles) && user.roles.includes('admin'));
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
