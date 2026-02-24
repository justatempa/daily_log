import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { getApiTokenFromRequest } from "@/server/openapi/token";

const bodySchema = z.object({
  content: z.string().optional().default(""),
  tags: z.string().optional().default(""),
  date: z.union([z.string(), z.number()]).optional(),
  isTodo: z.boolean().optional().default(false),
});

const parseDateInput = (value: string | number | undefined) => {
  if (value === undefined || value === null || value === "") {
    return new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export async function POST(req: Request) {
  const token = getApiTokenFromRequest(req);
  if (!token) {
    return NextResponse.json(
      { error: "Missing API token." },
      { status: 401 },
    );
  }

  const user = await db.user.findFirst({
    where: { secretKey: token, isActive: true },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid API token." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const content = parsed.data.content.trim();
  const tags = parsed.data.tags.trim();
  if (!content && !tags) {
    return NextResponse.json(
      { error: "content or tags required." },
      { status: 400 },
    );
  }

  const date = parseDateInput(parsed.data.date);
  if (!date) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const log = await db.log.create({
    data: {
      userId: user.id,
      content,
      tags,
      date,
      isTodo: parsed.data.isTodo,
      isTodoDone: false,
    },
  });

  return NextResponse.json({ id: log.id }, { status: 201 });
}
