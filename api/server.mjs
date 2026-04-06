import { handleRequest } from "../server.mjs";

export default async function vercelHandler(req, res) {
  return handleRequest(req, res);
}
