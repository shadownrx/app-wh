import http from "http";
import { env } from "./config/env";
import { createApp } from "./app";
import { attachSockets } from "./realtime";
import { expireInactiveMatches } from "./jobs/inactivity";
import { bootstrapCatalog } from "./lib/bootstrap";

async function main() {
  await bootstrapCatalog();
  const app = createApp();
  const server = http.createServer(app);
  attachSockets(server);

  setInterval(() => {
    expireInactiveMatches().catch((err) => console.error("inactive job", err));
  }, 15 * 60 * 1000);

  server.listen(env.port, () => {
    console.log(`${env.appName} API listening on :${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
