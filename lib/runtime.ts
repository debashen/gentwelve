import { DB } from "@/lib/database";

export const env = new Proxy({ DB } as Record<string, unknown> & { DB: typeof DB }, {
  get(target, property: string) {
    if (property === "DB") return target.DB;
    return process.env[property];
  },
});
