import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  projectGroups,
  projectGroupMembers,
  accounts,
  projects,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateCsrf, validateLabel, generateSecureId } from "@/lib/security";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemberInput {
  accountId: string;
  projectId?: string | null;
}

// ─── GET /api/project-groups ────────────────────────────────────────────────

/**
 * Returns all project groups with their members.
 *
 * Response shape:
 * [
 *   {
 *     id, name, createdAt, updatedAt,
 *     members: [{ id, accountId, projectId, accountLabel, projectLabel, integrationId }]
 *   }
 * ]
 */
export async function GET() {
  const db = getDb();

  const allGroups = db.select().from(projectGroups).all();
  const allMembers = db.select().from(projectGroupMembers).all();
  const allAccounts = db.select().from(accounts).all();
  const allProjects = db.select().from(projects).all();

  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
  const projectMap = new Map(allProjects.map((p) => [p.id, p]));

  const membersByGroup = new Map<string, typeof allMembers>();
  for (const m of allMembers) {
    const list = membersByGroup.get(m.groupId) ?? [];
    list.push(m);
    membersByGroup.set(m.groupId, list);
  }

  const result = allGroups.map((group) => {
    const members = (membersByGroup.get(group.id) ?? []).map((m) => {
      const account = accountMap.get(m.accountId);
      const project = m.projectId ? projectMap.get(m.projectId) : null;
      return {
        id: m.id,
        accountId: m.accountId,
        projectId: m.projectId,
        accountLabel: account?.label ?? m.accountId,
        projectLabel: project?.label ?? null,
        integrationId: account?.integrationId ?? null,
      };
    });

    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members,
    };
  });

  return NextResponse.json(result);
}

// ─── POST /api/project-groups ───────────────────────────────────────────────

/**
 * Create a new project group.
 *
 * Body: {
 *   name: string,
 *   members: Array<{ accountId: string, projectId?: string | null }>
 * }
 */
export async function POST(request: Request) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, members } = body;

  // Validate name
  const nameError = validateLabel(name);
  if (nameError) {
    return NextResponse.json(
      { error: nameError.message.replace("Label", "Name") },
      { status: 400 }
    );
  }

  // Validate members array
  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json(
      { error: "Members must be a non-empty array" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Validate all referenced accounts/projects exist
  for (const member of members as MemberInput[]) {
    if (typeof member.accountId !== "string" || member.accountId.length === 0) {
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

  const now = new Date().toISOString();
  const groupId = generateSecureId();

  // Insert group + members atomically so a crash mid-way can't leave
  // an orphaned group with partial members.
  db.transaction((tx) => {
    tx.insert(projectGroups)
      .values({
        id: groupId,
        name: (name as string).trim(),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const member of members as MemberInput[]) {
      tx.insert(projectGroupMembers)
        .values({
          id: generateSecureId(),
          groupId,
          accountId: member.accountId,
          projectId: member.projectId ?? null,
          createdAt: now,
        })
        .run();
    }
  });

  return NextResponse.json({ id: groupId, name }, { status: 201 });
}
