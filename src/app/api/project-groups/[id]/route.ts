import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projectGroups, projectGroupMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateCsrf, validateLabel, generateSecureId } from "@/lib/security";
import { accounts, projects } from "@/lib/db/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemberInput {
  accountId: string;
  projectId?: string | null;
}

// ─── PUT /api/project-groups/[id] ───────────────────────────────────────────

/**
 * Update a project group (rename, update members).
 *
 * Body: {
 *   name?: string,
 *   members?: Array<{ accountId: string, projectId?: string | null }>
 * }
 *
 * If `members` is provided, the existing members are replaced entirely
 * (delete-and-reinsert strategy, matching the simple local-first approach).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const group = db
    .select()
    .from(projectGroups)
    .where(eq(projectGroups.id, id))
    .get();

  if (!group) {
    return NextResponse.json(
      { error: "Project group not found" },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();

  // Update name if provided
  if (body.name !== undefined) {
    const nameError = validateLabel(body.name);
    if (nameError) {
      return NextResponse.json(
        { error: nameError.message.replace("Label", "Name") },
        { status: 400 }
      );
    }

    db.update(projectGroups)
      .set({ name: (body.name as string).trim(), updatedAt: now })
      .where(eq(projectGroups.id, id))
      .run();
  }

  // Replace members if provided
  if (body.members !== undefined) {
    const members = body.members;

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json(
        { error: "Members must be a non-empty array" },
        { status: 400 }
      );
    }

    // Validate all referenced accounts/projects exist
    for (const member of members as MemberInput[]) {
      if (
        typeof member.accountId !== "string" ||
        member.accountId.length === 0
      ) {
        return NextResponse.json(
          { error: "Each member must have a valid accountId" },
          { status: 400 }
        );
      }

      const account = db
        .select()
        .from(accounts)
        .where(eq(accounts.id, member.accountId))
        .get();
      if (!account) {
        return NextResponse.json(
          { error: `Account "${member.accountId}" not found` },
          { status: 404 }
        );
      }

      if (member.projectId) {
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, member.projectId))
          .get();
        if (!project) {
          return NextResponse.json(
            { error: `Project "${member.projectId}" not found` },
            { status: 404 }
          );
        }
      }
    }

    // Delete existing members
    db.delete(projectGroupMembers)
      .where(eq(projectGroupMembers.groupId, id))
      .run();

    // Insert new members
    for (const member of members as MemberInput[]) {
      db.insert(projectGroupMembers)
        .values({
          id: generateSecureId(),
          groupId: id,
          accountId: member.accountId,
          projectId: member.projectId ?? null,
          createdAt: now,
        })
        .run();
    }

    // Touch updatedAt even if name wasn't changed
    db.update(projectGroups)
      .set({ updatedAt: now })
      .where(eq(projectGroups.id, id))
      .run();
  }

  return NextResponse.json({ success: true });
}

// ─── DELETE /api/project-groups/[id] ────────────────────────────────────────

/**
 * Delete a project group.
 * Members are cascade-deleted via the FK constraint.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  const db = getDb();

  const group = db
    .select()
    .from(projectGroups)
    .where(eq(projectGroups.id, id))
    .get();

  if (!group) {
    return NextResponse.json(
      { error: "Project group not found" },
      { status: 404 }
    );
  }

  db.delete(projectGroups).where(eq(projectGroups.id, id)).run();

  return NextResponse.json({ success: true });
}
