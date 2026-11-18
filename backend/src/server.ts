import http from "http";
import app from "./app";
import { env } from "./config/env.config";
import { initializeSocket } from "./infrastructure/websocket/socket.server";
import logger from "./utils/logger";
import prisma from "./infrastructure/prisma/prisma.client";
const server = http.createServer(app);
initializeSocket(server);
const start = async () => {
  try {
    await prisma.$connect();
    logger.info("Database connected");
    server.listen(env.PORT, () => {
      logger.info(`LogiOps server on port ${env.PORT}`);
      logger.info(`API: http://localhost:${env.PORT}/api/v1`);
    });
  } catch (error) {
    logger.error("Failed to start:", error);
    process.exit(1);
  }
};
process.on("unhandledRejection", (err: Error) => {
  logger.error("UNHANDLED REJECTION:", err);
  server.close(() => process.exit(1));
});
process.on("uncaughtException", (err: Error) => {
  logger.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});
process.on("SIGTERM", () => {
  server.close(() => logger.info("Process terminated"));
});
start();
