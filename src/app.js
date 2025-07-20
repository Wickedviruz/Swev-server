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
const outfitLoader = require('./core/outfitLoader');
const WorldLoader = require('./core/worldLoader'); // Använd stor 'W' för klassen
const GlobalEventLoader = require("./core/GlobalEventLoader");

const setupSocketHandlers = require('./core/socketHandlers'); // Importerar setup-funktionen för socket-hanterare
const GameEngine = require('./core/GameEngine'); // **NYTT**: Importera GameEngine

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
    try { await monsterLoader.loadAll(); } catch (err) { logger.error(`[MONSTER] Failed to load monsters: ${err.message}`); process.exit(1); }
    try { await outfitLoader.loadAll(); } catch (err) { logger.error(`[OUTFITS] Failed to load outfits: ${err.message}`); process.exit(1); }
    try { await itemLoader.loadAll(); } catch (err) { logger.error(`[ITEM] Failed to load items: ${err.message}`); process.exit(1); }
    try { await WorldLoader.loadAll(); } catch (err) { logger.error(`[WORLD] Failed to load world data: ${err.message}`); process.exit(1); }
    try { await npcLoader.loadAll(); } catch (err) { logger.error(`[NPC] Failed to load npcs: ${err.message}`); process.exit(1); }
    try { await GlobalEventLoader.loadAll(); } catch (err) { logger.error(`[GLOBALEVENTS] Failed to load globalevents: ${err.message}`); process.exit(1); }
    // --------------------------------------------------------------

    // Express & routes
    const app = express();
    const accountRouter = require('./routes/account');
    const characterRouter = require('./routes/character');
    app.use(cors());
    app.use(express.json());
    app.use('/api/account', accountRouter);
    app.use('/api/character', characterRouter);

    // Socket.io
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    // Initiera PlayerManager via socketHandlers.
    // VIKTIGT: Vi modifierar socketHandlers för att RETURNERA playerManager-instansen.
    const playerManager = setupSocketHandlers(io, dbPool, WorldLoader);

    // **NYTT**: Initiera GameEngine med alla nödvändiga beroenden.
    const gameEngine = new GameEngine(playerManager, npcLoader, monsterLoader, WorldLoader, io);
    gameEngine.start(); // **NYTT**: Starta spel-loopen!

    // Starta HTTP-servern
    server.listen(port, () => {
        logger.success(`[SERVER] is running on: ${port}`);
    });

    // --- Hantering av serveravstängning och resursfrisläppning ---
    const cleanupAndExit = async () => {
        logger.log("Server shutting down. Initiating cleanup...");
        try {
            gameEngine.stop(); // **NYTT**: Stoppa spel-loopen graciöst

            if (client) { client.release(); logger.success("[DATABASE] Client connection released."); }
            if (dbPool) { await dbPool.end(); logger.success("[DATABASE] Connection pool ended."); }

            // Antar att dina loaders har en cleanup-metod som stänger Lua-stater etc.
            monsterLoader.cleanup();
            itemLoader.cleanup();
            npcLoader.cleanup();
            outfitLoader.cleanup();
            GlobalEventLoader.cleanup();
            WorldLoader.cleanup();

            logger.success("All resources cleaned up successfully.");
            process.exit(0);
        } catch (err) {
            logger.error(`Error during cleanup: ${err.message}`, err);
            process.exit(1);
        }
    };

    process.on('SIGINT', cleanupAndExit);
    process.on('SIGTERM', cleanupAndExit);
    process.on('exit', (code) => {
        logger.log(`Process exited with code: ${code}`);
    });
}

bootstrap().catch(err => {
    logger.error(`Fatal error during server bootstrap: ${err.message}`, err);
    process.exit(1);
});