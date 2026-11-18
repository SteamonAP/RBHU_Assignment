import prisma from "../../infrastructure/prisma/prisma.client";
import { CreateCustomerDto, UpdateCustomerDto } from "./customer.validation";
export const customerRepository = {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }) {
    const { page, limit, search, status } = params;
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };
    if (search)
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.count({ where }),
    ]);
    return { data, total };
  },
  async findById(id: string) {
    return prisma.customer.findFirst({ where: { id, deletedAt: null } });
  },
  async create(dto: CreateCustomerDto) {
    return prisma.customer.create({ data: dto });
  },
  async update(id: string, dto: UpdateCustomerDto) {
    return prisma.customer.update({ where: { id }, data: dto });
  },
  async softDelete(id: string) {
    return prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
