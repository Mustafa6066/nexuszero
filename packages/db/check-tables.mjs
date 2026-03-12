import postgres from 'postgres';

const DATABASE_URL = 'postgresql://postgres:XuCtJSPCvcusYkCtgptcdcXhXOiIrfPn@tramway.proxy.rlwy.net:44369/railway';

const sql = postgres(DATABASE_URL, { ssl: 'allow', connect_timeout: 10 });

try {
  const result = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  console.log('Tables in database:');
  result.forEach(r => console.log(' -', r.table_name));
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await sql.end();
}
