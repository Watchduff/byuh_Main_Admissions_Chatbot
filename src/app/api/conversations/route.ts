import { pool } from '@/db/index';
import { getOrCreateSessionId } from '@/lib/session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// List all conversations for this session
export async function GET() {
  const sessionId = await getOrCreateSessionId();

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, title, created_at FROM conversations WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );
    return NextResponse.json(result.rows);
  } finally {
    client.release();
  }
}

// Create a new conversation
export async function POST() {
  const sessionId = await getOrCreateSessionId();

  const client = await pool.connect();
  try {
    const result = await client.query(
      "INSERT INTO conversations (session_id) VALUES ($1) RETURNING id, title, created_at",
      [sessionId]
    );
    return NextResponse.json(result.rows[0]);
  } finally {
    client.release();
  }
}
