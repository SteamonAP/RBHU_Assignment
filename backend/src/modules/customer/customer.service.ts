import { customerRepository } from "./customer.repository";
import { AppError } from "../../errors/AppError";
import {
  CreateCustomerDto,
  CustomerListQuery,
  UpdateCustomerDto,
} from "./customer.validation";
export const customerService = {
  async getCustomers(query: CustomerListQuery) {
    const { page, limit } = query;
    return customerRepository.findAll({
      page,
      limit,
      search: query.search,
      status: query.status,
    });
  },
  async getCustomerById(id: string) {
    const c = await customerRepository.findById(id);
    if (!c) throw new AppError("Customer not found", 404);
    return c;
  },
  async createCustomer(dto: CreateCustomerDto) {
    return customerRepository.create(dto);
  },
  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    const existing = await customerRepository.findById(id);
    if (!existing) throw new AppError("Customer not found", 404);
    return customerRepository.update(id, dto);
  },
  async deleteCustomer(id: string) {
    const existing = await customerRepository.findById(id);
    if (!existing) throw new AppError("Customer not found", 404);
    await customerRepository.softDelete(id);
  },
};
