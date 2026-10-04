import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { GraphQLError } from 'graphql';

import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { getSession } from './auth.js';
import { naiveIntrospectionFilter } from './middleware.js';
import { waitForDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

// Hide implementation details. Internal/unexpected errors become a generic
// message with no stack trace or DB detail. Validation errors (including the
// "did you mean" field suggestions from graphql-js) are passed through so the
// schema can still be probed the intended way.
function formatError(formattedError, error) {
  const code = formattedError.extensions?.code;
  const expected = new Set([
    'GRAPHQL_VALIDATION_FAILED',
    'GRAPHQL_PARSE_FAILED',
    'BAD_USER_INPUT',
    'UNAUTHENTICATED',
    'BAD_CREDENTIALS',
    'POLICY_BLOCKED',
  ]);
  if (code && expected.has(code)) {
    return { message: formattedError.message, extensions: { code } };
  }
  // Anything else (e.g. a DB error) is masked.
  return {
    message: 'Internal server error.',
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}

async function main() {
  await waitForDb();

  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Realistic production misconfiguration: introspection + field
    // suggestions left on.
    introspection: true,
    includeStacktraceInErrorMessages: false,
    formatError,
    // Batched operations in a single POST are accepted (so naive per-request
    // rate limiting does nothing to stop enumeration).
    allowBatchedHttpRequests: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // No landing page / embedded IDE. The only player-facing surfaces are the
      // product SPA and the raw /graphql endpoint; players bring their own
      // GraphQL tooling. (Introspection stays enabled below — see schema.)
      ApolloServerPluginLandingPageDisabled(),
    ],
  });

  await server.start();

  app.use(cors());
  app.use(bodyParser.json({ limit: '1mb' }));

  // GraphQL endpoint.
  //
  // Difficulty toggle: the naive "__schema" gateway filter is OFF by default
  // (plain introspection works). Set ENABLE_WAF=1 to switch on the bypassable
  // filter for a harder variant that forces field-level introspection.
  const wafChain = process.env.ENABLE_WAF === '1' ? [naiveIntrospectionFilter] : [];
  if (wafChain.length) console.log('[mode] naive introspection filter ENABLED (hard mode)');

  app.use(
    '/graphql',
    ...wafChain,
    expressMiddleware(server, {
      context: async ({ req }) => ({ session: getSession(req) }),
    }),
  );

  // Simple health endpoint.
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Serve the product front end.
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html')),
  );

  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
  // eslint-disable-next-line no-console
  console.log(`NIMBUS People Cloud listening on :${PORT} (GraphQL at /graphql)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
