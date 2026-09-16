import { startServer } from "./app";

const PORT = Number(process.env.PORT) || 8080;

const handle = await startServer(PORT);
// eslint-disable-next-line no-console
console.log(`Tic-Tac-Toe multiplayer server listening on :${PORT}`);

async function shutdown() {
  await handle.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
