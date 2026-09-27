import { requireUser, isAdmin, json } from './_auth.mjs';
export default async () => {
  const { user, response } = await requireUser();
  if (response) return response;
  return json({ isAdmin: isAdmin(user), email: user.email || '' });
};
