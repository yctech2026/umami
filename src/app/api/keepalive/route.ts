import { getRawDB } from '@/lib/db';

export async function GET() {
  const start = Date.now();

  try {
    const db = await getRawDB();
    const { results } = await db.prepare('SELECT status, updated_at FROM alive WHERE id = 1').all();
    const elapsed = Date.now() - start;

    const row = results?.[0] || {};

    return new Response(
      JSON.stringify({
        status: 'ok',
        d1: 'connected',
        alive: row,
        elapsed,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const elapsed = Date.now() - start;
    return new Response(
      JSON.stringify({
        status: 'error',
        d1: 'disconnected',
        error: String(error),
        elapsed,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
