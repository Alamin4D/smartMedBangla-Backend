import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env, isProd } from "./config/env.js";
import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import { apiLimiter } from "./middlewares/rateLimit.middleware.js";
import routes from "./routes/index.js";

export function createApp() {
  const app = express();


  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" })); // SSLCommerz callbacks
  app.use(cookieParser());
  app.use(morgan(isProd ? "combined" : "dev"));

  app.get("/", (_req, res) => {
    res.json({ success: true, message: "SmartMed API is running", docs: "/api/health" });
  });

  app.use("/api", apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
