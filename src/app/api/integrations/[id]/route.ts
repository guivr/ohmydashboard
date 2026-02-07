import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateCsrf, validateLabel, validateBoolean } from "@/lib/security";

/**
 * DELETE /api/integrations/[id]
 * Remove a connected account.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF check
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  const db = getDb();

  const account = db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  db.delete(accounts).where(eq(accounts.id, id)).run();

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/integrations/[id]
 * Update an account (toggle active, rename).
 *
 * Body: { label?: string, isActive?: boolean }
 * Only these two fields are accepted. All other fields are ignored.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF check
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();

  const account = db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Strict allowlist — only label and isActive can be updated
  const updates: { updatedAt: string; label?: string; isActive?: boolean } = {
    updatedAt: new Date().toISOString(),
  };

  if (body.label !== undefined) {
    const labelError = validateLabel(body.label);
    if (labelError) {
      return NextResponse.json(
        { error: labelError.message },
        { status: 400 }
      );
    }
    updates.label = (body.label as string).trim();
  }

  if (body.isActive !== undefined) {
    const boolError = validateBoolean("isActive", body.isActive);
    if (boolError) {
      return NextResponse.json(
        { error: boolError.message },
        { status: 400 }
      );
    }
    updates.isActive = body.isActive as boolean;
  }

  db.update(accounts).set(updates).where(eq(accounts.id, id)).run();

  return NextResponse.json({ success: true });
}
