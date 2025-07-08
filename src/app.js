const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const config = require("./config/config");
const logger = require("./utils/logger");
const monsterLoader = require("./core/monsterLoader");
const itemLoader = require('./core/ItemLoader');
const npcLoader = require('./core/NpcLoader');

async function bootstrap() {
  logger.log("Booting server..");
  logger.log("Loading config...");
  const port = config.get("gameProtocolPort", 7172);

  logger.log("Connecting to database...");
  const dbPool = new Pool({
    host: config.get("pg_host"),
    port: config.get("pg_port"),
    database: config.get("pg_database"),
    user: config.get("pg_user"),
    password: config.get("pg_password"),
  });
  const client = await dbPool.connect();
  logger.success("[DATABASE] is connected!");

  // ----------- Ladda script/data här -----------
  try {
    await monsterLoader.loadAll();
    logger.success(`[MONSTER] Loaded ${monsterLoader.monsters.size} monsters!`);
  } catch (err) {
    logger.error(`[MONSTER] Failed to load monsters: ${err.message}`);
    process.exit(1);
  }
  try {
    await itemLoader.loadAll();
    logger.success(`[ITEM] Loaded ${itemLoader.items.size} items!`);
  } catch (err) {
    logger.error(`[ITEM] Failed to load items: ${err.message}`);
    process.exit(1);
  }
  try {
    await npcLoader.loadAll();
    logger.success(`[NPC] Loaded ${npcLoader.npcs.size} npcs!`);
  } catch (err) {
    logger.error(`[NPC] Failed to load npcs: ${err.message}`);
    process.exit(1);
  }
  // --------------------------------------------------------------

  // Express & routes
  const app = express();
  const accountRouter = require('./routes/account');
  const characterRouter = require('./routes/character');
  app.use(cors());
  app.use(express.json());
  app.use('/api/account', accountRouter);
  app.use('/api/character', characterRouter);

  // Socket.io + game loop
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  // Du kan bryta ut din socket-setup till en egen modul, t.ex. setupSockets(io, dbPool, monsterLoader)
  require('./core/socketHandlers')(io, dbPool);

  // Starta servern
  server.listen(port, () => {
    logger.success(`[SERVER] is running on: ${port}`);
  });

  // Släpp klienten när servern stänger
  process.on('exit', () => client.release());
}

bootstrap().catch(err => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
