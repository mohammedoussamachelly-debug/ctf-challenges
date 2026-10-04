import jwt from 'jsonwebtoken';

// In a real deployment this would be a managed secret. For the CTF it only
// needs to be stable for the life of the container.
const JWT_SECRET =
  process.env.JWT_SECRET || 'nimbus-people-cloud-dev-signing-key';

export function signSession(employee) {
  // NOTE: the token faithfully carries who the caller is. The bug is NOT in
  // the token — it is that resolvers trust the token for *authentication* but
  // never check *authorization* (object ownership) on the records requested.
  return jwt.sign(
    { sub: employee.id, role: employee.role, email: employee.email },
    JWT_SECRET,
    { expiresIn: '8h' },
  );
}

// Returns the decoded session for a request, or null if unauthenticated.
export function getSession(req) {
  const header = req.headers['authorization'] || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    return { employeeId: Number(payload.sub), role: payload.role, email: payload.email };
  } catch {
    return null;
  }
}
