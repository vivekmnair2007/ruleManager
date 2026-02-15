import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../../.env" });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BACKEND_PORT: z.coerce.number().default(4000)
});

export const env = schema.parse(process.env);
