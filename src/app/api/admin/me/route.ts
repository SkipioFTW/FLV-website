import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  return NextResponse.json({ authorized: isAuthorized(req) });
}
