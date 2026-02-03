import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const name = process.env.ADMIN_NAME ?? "Admin";

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed: admin user already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.user.create({
    data: {
      email,
      name,
      password: passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Seed: admin user created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
