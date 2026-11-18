import prisma from "../../infrastructure/prisma/prisma.client";
export const dashboardService = {
  async getSummary() {
    const [totalCustomers, totalShipments, shipmentGroups] = await Promise.all([
      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.shipment.count(),
      prisma.shipment.groupBy({ by: ["status"], _count: { status: true } }),
    ]);
    const shipmentStatusDistribution: Record<string, number> = {
      Pending: 0,
      PickedUp: 0,
      InTransit: 0,
      Delivered: 0,
      Cancelled: 0,
    };
    for (const g of shipmentGroups)
      shipmentStatusDistribution[g.status] = g._count.status;
    return { totalCustomers, totalShipments, shipmentStatusDistribution };
  },
};
