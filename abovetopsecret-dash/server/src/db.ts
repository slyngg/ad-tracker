import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' ? undefined : 'postgres://ats_user:changeme@localhost:5432/abovetopsecret'),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Kill any query that runs longer than 30s — prevents runaway queries from holding connections
  statement_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
