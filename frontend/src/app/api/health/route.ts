import { NextResponse } from "next/server";

// Health check endpoint - bypasses authentication
export async function GET() {
  return NextResponse.json({ status: "healthy", timestamp: new Date().toISOString() });
}
