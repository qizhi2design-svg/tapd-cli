import { loadCredentials } from "./config.js";
import { TapdClient } from "./api.js";

export async function getToken(client = new TapdClient()): Promise<string> {
  const credentials = await loadCredentials();
  if (credentials.mode === "personal") {
    return credentials.personalToken;
  }
  const token = await client.requestToken(credentials);
  return token.accessToken;
}
