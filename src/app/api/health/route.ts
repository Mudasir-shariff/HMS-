import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const startTime = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: 'Missing Supabase environment variables',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
    });

    // Check database connection by querying 1 row from hospital_settings
    const dbStart = Date.now();
    const { data, error } = await supabase
      .from('hospital_settings')
      .select('hospital_name')
      .limit(1)
      .maybeSingle();

    const dbLatencyMs = Date.now() - dbStart;

    if (error) {
      return NextResponse.json(
        {
          status: 'degraded',
          database: {
            status: 'error',
            message: error.message,
            latencyMs: dbLatencyMs,
          },
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: 'healthy',
        database: {
          status: 'connected',
          hospitalName: data?.hospital_name || 'RADHAKRISHNA HOSPITAL',
          latencyMs: dbLatencyMs,
        },
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        totalLatencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: err?.message || 'Internal health check error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
