import { createHealthResponse } from "@velobase/contracts";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(createHealthResponse());
}
