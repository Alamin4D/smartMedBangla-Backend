/**
 * Seeds the first ADMIN account from environment variables.
 * No demo/dummy data is created – every other record comes from real usage.
 *
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StrongPass123 npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "SmartMed Admin";

  if (!email || !password) {
    console.log("ℹ️  ADMIN_EMAIL / ADMIN_PASSWORD not set – skipping admin seed.");
    return;
  }
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name, role: "ADMIN", isEmailVerified: true, passwordHash: await bcrypt.hash(password, 12), language: "en" },
    update: { role: "ADMIN", isEmailVerified: true, status: "ACTIVE" },
  });
  console.log(`✅ Admin ready: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
