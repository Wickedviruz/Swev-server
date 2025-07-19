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
const WorldLoader = require('./core/worldLoader'); // Notera att du har två rader med worldLoader, behåll en
const GlobalEventLoader = require("./core/GlobalEventLoader");

// Importera socketHandlers, som nu kommer att hantera PlayerManager internt
const setupSocketHandlers = require('./core/socketHandlers');

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
    const client = await dbPool.connect(); // Behåll denna för att kontrollera anslutningen
    logger.success("[DATABASE] is connected!");

    // ----------- Ladda script/data här -----------
    // Ordningen här är viktig. Loaders som exponeras för Lua måste laddas först,
    // och sedan GlobalEvents och NPCs som använder Lua-tolken.
    try {
        await monsterLoader.loadAll();
    } catch (err) {
        logger.error(`[MONSTER] Failed to load monsters: ${err.message}`);
        process.exit(1);
    }
    try {
        await outfitLoader.loadAll();
    } catch (err) {
        logger.error(`[OUTFITS] Failed to load outfits: ${err.message}`);
        process.exit(1);
    }
    try {
        await itemLoader.loadAll();
    } catch (err) {
        logger.error(`[ITEM] Failed to load items: ${err.message}`);
        process.exit(1);
    }
    // WorldLoader bör laddas innan NPCs om NPCs behöver världsinformation
    try {
        await WorldLoader.loadAll(); // Använd WorldLoader här
    } catch (err) {
        logger.error(`[WORLD] Failed to load world data: ${err.message}`); // Korrigerat loggmeddelande
        process.exit(1);
    }
    // NPCs och GlobalEvents kan ladda Lua-skript som använder dina API:er
    try {
        await npcLoader.loadAll();
    } catch (err) {
        logger.error(`[NPC] Failed to load npcs: ${err.message}`);
        process.exit(1);
    }
    try {
        await GlobalEventLoader.loadAll();
    } catch (err) {
        logger.error(`[GLOBALEVENTS] Failed to load globalevents: ${err.message}`);
        process.exit(1);
    }
    // --------------------------------------------------------------

    // Express & routes (för REST API, t.ex. konto och karaktärshantering)
    const app = express();
    const accountRouter = require('./routes/account');
    const characterRouter = require('./routes/character');
    app.use(cors());
    app.use(express.json());
    app.use('/api/account', accountRouter);
    app.use('/api/character', characterRouter);

    // Socket.io (för realtidsspeldata och kommunikation)
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    // Initiera dina socket-hanterare
    // Denna funktion tar nu 'io', 'dbPool', och 'worldLoader' för att sätta upp PlayerManager internt.
    setupSocketHandlers(io, dbPool, WorldLoader); // Se till att skicka in den korrekta instansen av WorldLoader

    // Starta servern
    server.listen(port, () => {
        logger.success(`[SERVER] is running on: ${port}`);
    });

    // --- Hantering av serveravstängning och resursfrisläppning ---
    // Detta är viktigt för att stänga databasanslutningar och frisläppa Lua-stater.

    const cleanupAndExit = async () => {
        logger.log("Server shutting down. Initiating cleanup...");
        try {
            // Frigör databasanslutningen
            if (client) { // Använd den initiala klienten som du kopplade upp
                client.release();
                logger.success("[DATABASE] Client connection released.");
            }
            if (dbPool) {
                await dbPool.end(); // Stänger hela poolen
                logger.success("[DATABASE] Connection pool ended.");
            }

            // Frigör Lua-stater från dina loaders
            monsterLoader.cleanup(); // Antar att dessa har en cleanup-metod
            itemLoader.cleanup();
            npcLoader.cleanup();
            outfitLoader.cleanup();
            GlobalEventLoader.cleanup();
            WorldLoader.cleanup(); // WorldLoader kan också ha Lua-stater eller andra resurser

            logger.success("All resources cleaned up successfully.");
            process.exit(0); // Avsluta processen graciöst
        } catch (err) {
            logger.error(`Error during cleanup: ${err.message}`, err);
            process.exit(1); // Avsluta med felkod
        }
    };

    // Hantera olika avstängningssignaler
    process.on('SIGINT', cleanupAndExit); // Ctrl+C i terminalen
    process.on('SIGTERM', cleanupAndExit); // Skickas av t.ex. Docker eller process managers
    process.on('exit', (code) => { // Körs när processen avslutas (efter SIGINT/SIGTERM)
        logger.log(`Process exited with code: ${code}`);
    });
}

// Starta servern och hantera fatala fel under bootstrap-fasen
bootstrap().catch(err => {
    logger.error("Fatal error during server bootstrap:", err);
    process.exit(1);
});