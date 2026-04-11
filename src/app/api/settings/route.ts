import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Server-side settings persistence was removed in 0.1.13. Store settings locally in the browser JSON instead.",
    },
    { status: 410 },
  );
}
