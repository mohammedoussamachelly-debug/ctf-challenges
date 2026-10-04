// "WAF-lite": a naive, well-intentioned but ineffective input filter.
//
// Security review once flagged that introspection was enabled, so someone
// added this to "block introspection" by rejecting any operation containing
// the full-schema meta-field `__schema`. It does nothing to stop field-level
// introspection via `__type(name: ...)`, so the schema is still fully
// walkable. This is deliberate: it steers solvers toward the bypass rather
// than hard-blocking introspection.

const BLOCK_PATTERN = /__schema\b/;

function extractQueries(body) {
  if (Array.isArray(body)) return body.map((op) => (op && op.query) || '');
  if (body && typeof body === 'object') return [body.query || ''];
  return [''];
}

export function naiveIntrospectionFilter(req, res, next) {
  if (req.method !== 'POST') return next();
  const queries = extractQueries(req.body);
  if (queries.some((q) => BLOCK_PATTERN.test(q))) {
    return res.status(200).json({
      errors: [
        {
          message:
            'Request blocked by NIMBUS API gateway policy (schema export is not permitted on this tenant).',
          extensions: { code: 'POLICY_BLOCKED' },
        },
      ],
    });
  }
  return next();
}
