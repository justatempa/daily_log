import { randomBytes } from "crypto";

const API_TOKEN_BYTES = 32;

export const generateApiToken = () =>
  randomBytes(API_TOKEN_BYTES).toString("base64url");

export const getApiTokenFromRequest = (req: Request) => {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const directHeader = req.headers.get("x-api-token");
  if (directHeader?.trim()) {
    return directHeader.trim();
  }

  return null;
};
