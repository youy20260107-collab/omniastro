import { getUser } from '@netlify/identity';

export async function requireUser() {
  const user = await getUser();
  if (!user) return { user: null, response: new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers: { 'content-type': 'application/json' } }) };
  return { user, response: null };
}

export function userEmail(user) {
  return String(user?.email || user?.userMetadata?.email || user?.user_metadata?.email || '').trim().toLowerCase();
}

export function isAdmin(user) {
  const email = userEmail(user);
  const roles = [
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(Array.isArray(user?.appMetadata?.roles) ? user.appMetadata.roles : []),
    ...(Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [])
  ].map(v => String(v).toLowerCase());
  return email === 'felix670131@gmail.com' || roles.includes('admin');
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
