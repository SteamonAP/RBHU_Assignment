import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { corsOrigins, env } from "../../config/env.config";
import prisma from "../prisma/prisma.client";
import logger from "../../utils/logger";
let io: SocketIOServer;
export const initializeSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      next(new Error("Authentication required."));
      return;
    }

    let userId: string;
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
      if (typeof payload === "string" || typeof payload.userId !== "string") {
        next(new Error("Invalid token."));
        return;
      }
      userId = payload.userId;
    } catch (error) {
      next(
        new Error(
          error instanceof jwt.TokenExpiredError
            ? "Token expired."
            : "Invalid token.",
        ),
      );
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        next(new Error("User no longer exists."));
        return;
      }
      socket.data.userId = user.id;
      next();
    } catch (error) {
      logger.error("Socket authentication failed:", error);
      next(new Error("Socket authentication failed."));
    }
  });
  io.on("connection", (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on("disconnect", () =>
      logger.info(`Socket disconnected: ${socket.id}`),
    );
  });
  return io;
};
export const getIO = (): SocketIOServer => {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
};
