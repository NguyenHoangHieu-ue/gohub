import "next-auth";
import "next-auth/jwt";
import type { Role } from "@/core/rbac";

declare module "next-auth" {
  interface Session {
    user: {
      username: string;
      role: Role;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username: string;
    role: Role;
  }
}
