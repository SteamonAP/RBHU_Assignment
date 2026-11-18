import { PrismaClient } from "../generated/prisma";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  console.log("Seeding...");
  const passwordHash = await bcrypt.hash("Admin@123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@logiops.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@logiops.com",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log("Admin:", admin.email);
  const c1 = await prisma.customer.upsert({
    where: { email: "john@acmelogistics.com" },
    update: {},
    create: {
      name: "John Smith",
      email: "john@acmelogistics.com",
      company: "Acme Logistics",
      status: "Active",
    },
  });
  const c2 = await prisma.customer.upsert({
    where: { email: "jane@globalship.com" },
    update: {},
    create: {
      name: "Jane Doe",
      email: "jane@globalship.com",
      company: "Global Shipping Co",
      status: "Active",
    },
  });
  const c3 = await prisma.customer.upsert({
    where: { email: "robert@fastfreight.com" },
    update: {},
    create: {
      name: "Robert Chen",
      email: "robert@fastfreight.com",
      company: "Fast Freight Ltd",
      status: "Inactive",
    },
  });
  console.log("Customers seeded");
  await prisma.shipment.upsert({
    where: { trackingNumber: "TRK-2026-001" },
    update: {},
    create: {
      trackingNumber: "TRK-2026-001",
      customerId: c1.id,
      origin: "Mumbai",
      destination: "Delhi",
      status: "InTransit",
    },
  });
  await prisma.shipment.upsert({
    where: { trackingNumber: "TRK-2026-002" },
    update: {},
    create: {
      trackingNumber: "TRK-2026-002",
      customerId: c2.id,
      origin: "Bangalore",
      destination: "Chennai",
      status: "Delivered",
    },
  });
  await prisma.shipment.upsert({
    where: { trackingNumber: "TRK-2026-003" },
    update: {},
    create: {
      trackingNumber: "TRK-2026-003",
      customerId: c1.id,
      origin: "Delhi",
      destination: "Kolkata",
      status: "Pending",
    },
  });
  await prisma.shipment.upsert({
    where: { trackingNumber: "TRK-2026-004" },
    update: {},
    create: {
      trackingNumber: "TRK-2026-004",
      customerId: c3.id,
      origin: "Pune",
      destination: "Hyderabad",
      status: "PickedUp",
    },
  });
  console.log("Shipments seeded");
  console.log("Done! Login: admin@logiops.com / Admin@123");
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
