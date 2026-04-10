import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { dbUrl } = body;

    if (!dbUrl || typeof dbUrl !== 'string') {
      return NextResponse.json({ error: 'DB URL is required and must be a string' }, { status: 400 });
    }

    const envPath = path.join(process.cwd(), '.env');
    
    // Check if .env exists, if so read it
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (e) {
      // File doesn't exist, we will create it
    }

    const newEnvLines: string[] = [];
    let updated = false;

    if (envContent) {
      const lines = envContent.split('\n');
      for (let line of lines) {
        if (line.trim().startsWith('DATABASE_URL=')) {
          newEnvLines.push(`DATABASE_URL="${dbUrl}"`);
          updated = true;
        } else {
          newEnvLines.push(line);
        }
      }
    }

    if (!updated) {
      newEnvLines.push(`DATABASE_URL="${dbUrl}"`);
    }

    await fs.writeFile(envPath, newEnvLines.join('\n'));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
