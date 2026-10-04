import pg from 'pg';

const { Pool } = pg;

// The server connects as the least-privilege application role (nimbus_app).
// Connection details come from the environment (see docker-compose.yml).
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://nimbus_app:app_only_readmostly_pw@db:5432/nimbus',
  max: 10,
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

// Wait for Postgres to accept connections before serving traffic.
export async function waitForDb(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export default pool;
