import prisma from "../../infrastructure/prisma/prisma.client";
import { CreateShipmentDto } from "./shipment.validation";
export const shipmentRepository = {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    customerId?: string;
  }) {
    const { page, limit, search, status, customerId } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search)
      where.OR = [
        { trackingNumber: { contains: search, mode: "insensitive" } },
        { origin: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
      ];
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    const [data, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, company: true } },
        },
      }),
      prisma.shipment.count({ where }),
    ]);
    return { data, total };
  },
  async findById(id: string) {
    return prisma.shipment.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, name: true, email: true, company: true },
        },
      },
    });
  },
  async findActiveCustomer(id: string) {
    return prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
  },
  async create(dto: CreateShipmentDto) {
    return prisma.shipment.create({
      data: dto,
      include: {
        customer: { select: { id: true, name: true, company: true } },
      },
    });
  },
  async updateStatus(id: string, status: string) {
    return prisma.shipment.update({
      where: { id },
      data: { status: status as any },
      include: { customer: { select: { id: true, name: true } } },
    });
  },
};
