import { NextResponse } from 'next/server';

// --- REPLACE THIS WITH YOUR DEPLOYED GOOGLE APPS SCRIPT WEB APP URL ---
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwGyPAqCEUDoyTATIKXXrWAraNTcyJdlhLiT9dGDDA_T-1iraIdGb06tkSpI2E7mknpTQ/exec'; 

export async function GET() {
  try {
    const response = await fetch(GAS_URL, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rankings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const result = await response.text();
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save ranking' }, { status: 500 });
  }
}
