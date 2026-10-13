import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Images are kept in memory so they can be sent to the AI and Cloudinary in parallel. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest("Only JPG, PNG, WEBP or HEIC images are allowed"));
  },
});
