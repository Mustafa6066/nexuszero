import postgres from 'postgres';

async function testConnection() {
  const url = process.env.DATABASE_URL;
  console.log('Testing connection to', url);
  
  try {
    const defaultSql = postgres(url, { max: 1 });
    const [{ '?column?': one }] = await defaultSql`SELECT 1`;
    console.log('Default connection success:', one);
    await defaultSql.end();
  } catch (err) {
    console.error('Default connection failed:', err.message);
  }

  try {
    const sslSql = postgres(url, { max: 1, ssl: 'require' });
    const [{ '?column?': one }] = await sslSql`SELECT 1`;
    console.log('SSL connection success:', one);
    await sslSql.end();
  } catch (err) {
    console.error('SSL connection failed:', err.message);
  }
}

testConnection();
