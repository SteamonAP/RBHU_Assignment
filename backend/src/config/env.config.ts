import dotenv from "dotenv";
dotenv.config();
const nodeEnv = process.env.NODE_ENV || "development";
const configuredJwtSecret = process.env.JWT_SECRET?.trim();

if (
  nodeEnv === "production" &&
  (!configuredJwtSecret || configuredJwtSecret.length < 32)
) {
  throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
}

const jwtSecret =
  configuredJwtSecret || "fallback-secret-change-in-production";

export const env = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: nodeEnv,
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: jwtSecret,
  JWT_EXPIRE: process.env.JWT_EXPIRE || "15m",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  RATE_LIMIT_WINDOW_MS: parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || "900000",
    10,
  ),
  RATE_LIMIT_MAX_REQUESTS: parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || "1000",
    10,
  ),
  AI_PROVIDER: process.env.AI_PROVIDER || "mock",
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "qwen2.5:3b",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

export const corsOrigins = [
  env.CORS_ORIGIN,
  ...(env.NODE_ENV === "production"
    ? []
    : ["http://localhost:5173", "http://localhost:3000"]),
];
