import type { Request, Response, NextFunction } from "express";

export type DemoUser = {
  userId: string;
  email: string;
  roles: string[];
};

export const DEMO_USER: DemoUser = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "demo@rule-manager.local",
  roles: ["admin", "approver"]
};

export function attachDemoUser(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { user?: DemoUser }).user = DEMO_USER;
  next();
}
