import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.config";
import { AppError } from "../../errors/AppError";
import prisma from "../../infrastructure/prisma/prisma.client";
import { LoginDto } from "./auth.validation";
export const authService = {
  async login(dto: LoginDto) {
    const user = await prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new AppError("Invalid email or password", 401);
    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) throw new AppError("Invalid email or password", 401);
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRE as any },
    );
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
    };
  },
  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) throw new AppError("User not found", 404);
    return user;
  },
};
