const Player = require("./Player");
const logger = require("../utils/logger");

// VIKTIGT: Importera REGION_SIZE_X och REGION_SIZE_Y direkt från WorldLoader.
// Se till att WorldLoader exporterar dessa konstanter längst ner i sin fil.
const { REGION_SIZE_X, REGION_SIZE_Y } = require("../core/worldLoader");

class PlayerManager {
    constructor(dbPool, io, worldLoader) {
        this.dbPool = dbPool;
        this.io = io; // Referens till Socket.IO-servern för broadcast
        this.worldLoader = worldLoader; // Behövs för spawn-positioner och regionladdning
        this.playersBySocketId = new Map(); // Karta: socket.id -> Player-instans
        this.playersByCharacterId = new Map(); // Karta: characterId -> Player-instans (snabb uppslagning)

        // En kontroll vid instansiering för att tidigt upptäcka problem
        if (!this.worldLoader || !this.worldLoader.worldInfo) {
            logger.error("[PlayerManager] WorldLoader not fully initialized or passed correctly. This indicates an incorrect boot order or missing WorldLoader export.");
            // Beroende på din felhanteringsstrategi kan du kasta ett fel här.
        }
    }

    /**
     * Lägger till en ny spelare i spelet vid inloggning.
     * Laddar spelardata från databasen och hanterar dubbellogin.
     * @param {Socket} socket - Socket.IO-instansen för den anslutna spelaren.
     * @param {number} characterId - ID för karaktären som ska loggas in.
     * @returns {Promise<Player|null>} Den nya Player-instansen om lyckad inloggning, annars null.
     */
    async addPlayer(socket, characterId) {
        // Kontrollera om spelaren redan är inloggad
        if (this.playersByCharacterId.has(Number(characterId))) {
            const oldPlayer = this.playersByCharacterId.get(Number(characterId));
            logger.log(`[PlayerManager] Duplicate login detected for characterId ${characterId}. Disconnecting previous socket: ${oldPlayer.socket.id}`);
            oldPlayer.socket.disconnect(true); // Koppla bort den gamla socketen
            // Ta bort från båda Maps
            this.playersBySocketId.delete(oldPlayer.socket.id);
            this.playersByCharacterId.delete(Number(characterId));
        }

        try {
            const result = await this.dbPool.query("SELECT * FROM characters WHERE id = $1", [characterId]);

            if (!result.rows.length) {
                logger.warn(`[PlayerManager] No character found in DB for ID: ${characterId}.`);
                return null; // Spelaren hittades inte
            }

            const characterData = result.rows[0];

            // VIKTIGT: Säkerställ att X, Y, Z parsas till heltal här!
            // Även om databasen är satt till INT, kan drivrutinen returnera strängar,
            // eller så kan gamla/korrupta data finnas.
            characterData.pos_x = parseInt(characterData.pos_x);
            characterData.pos_y = parseInt(characterData.pos_y);
            characterData.pos_z = parseInt(characterData.pos_z);

            // Om koordinaterna fortfarande är ogiltiga (NaN), använd default spawn
            if (isNaN(characterData.pos_x) || isNaN(characterData.pos_y) || isNaN(characterData.pos_z)) {
                logger.warn(`[PlayerManager] Character '${characterData.name}' (ID: ${characterData.id}) has invalid coordinates (${characterData.pos_x}, ${characterData.pos_y}, ${characterData.pos_z}). Spawning at default world spawn.`);
                const defaultSpawn = this.worldLoader.getStartSpawn();
                if (defaultSpawn) {
                    characterData.pos_x = defaultSpawn.x;
                    characterData.pos_y = defaultSpawn.y;
                    characterData.pos_z = defaultSpawn.z;
                } else {
                    // Fallback om ingen default spawn finns i world.xml (bör inte hända med generateTestWorld.js)
                    logger.error("[PlayerManager] No default spawn defined in world.xml and character coordinates are invalid. Player cannot be placed in world.");
                    return null; // Förhindra inloggning om vi inte har en säker position
                }
            }
            
            const newPlayer = new Player(characterData, socket);

            this.playersBySocketId.set(socket.id, newPlayer);
            this.playersByCharacterId.set(newPlayer.id, newPlayer);

            logger.log(`[PlayerManager] Character '${newPlayer.name}' (ID: ${newPlayer.id}) successfully loaded and added.`);
            logger.log(`[PlayerManager] Current active players count: ${this.getOnlinePlayers().length}`);

            // Ladda initiala kartregioner för spelaren
            // Använd de importerade konstanterna REGION_SIZE_X och REGION_SIZE_Y
            const regionX = Math.floor(newPlayer.x / REGION_SIZE_X);
            const regionY = Math.floor(newPlayer.y / REGION_SIZE_Y);
            const regionZ = newPlayer.z;

            // Ladda 3x3 regioner runt spelarens nuvarande region
            const regionsToLoad = [
                {x: regionX, y: regionY, z: regionZ},
                {x: regionX - 1, y: regionY, z: regionZ},
                {x: regionX + 1, y: regionY, z: regionZ},
                {x: regionX, y: regionY - 1, z: regionZ},
                {x: regionX, y: regionY + 1, z: regionZ},
                {x: regionX - 1, y: regionY - 1, z: regionZ},
                {x: regionX + 1, y: regionY - 1, z: regionZ},
                {x: regionX - 1, y: regionY + 1, z: regionZ},
                {x: regionX + 1, y: regionY + 1, z: regionZ},
            ];
            
            // Kör alla getRegion-anrop parallellt
            await Promise.all(regionsToLoad.map(async r => {
                const region = await this.worldLoader.getRegion(r.x, r.y, r.z);
                // Om en region inte kunde laddas, bör WorldLoader redan ha loggat felet.
                // Vi kan logga en ytterligare varning här om regionen är kritisk för spelaren.
                if (!region) {
                    logger.warn(`[PlayerManager] Failed to load essential region ${r.x}-${r.y}-${r.z} for player ${newPlayer.id}. Player might experience visual glitches.`);
                }
                return region; // Returnera regionen för Promise.all
            }));
            logger.log(`[PlayerManager] Loaded initial map regions for player ${newPlayer.id}.`);

            // Skicka initial data till den anslutna klienten
            // Vi skickar en array av *värdena* från WorldLoaders regions Map
            socket.emit("mapData", { loadedRegions: Array.from(this.worldLoader.regions.values()), player: newPlayer.getPublicData() });
            this.io.emit("playerJoined", newPlayer.getPublicData()); // Broadcast till alla
            socket.emit("currentPlayers", this.getOnlinePlayers().map(p => p.getPublicData())); // Skicka alla online till nya spelaren

            return newPlayer; // Returnera den nya Player-instansen
        } catch (err) {
            logger.error(`[PlayerManager] DB error or WorldLoader error during player login for socket ${socket.id}: ${err.message}`, err);
            return null;
        }
    }

    /**
     * Tar bort en spelare från spelet vid utloggning eller diskonnektion.
     * Sparar spelardata till databasen.
     * @param {string} socketId - Socket ID för spelaren som ska tas bort.
     * @returns {Promise<boolean>} True om spelaren togs bort, annars false.
     */
    async removePlayer(socketId) {
        const player = this.playersBySocketId.get(socketId);
        if (!player) {
            logger.warn(`[PlayerManager] Attempted to remove unknown player with socket ID: ${socketId}`);
            return false;
        }

        try {
            const saveData = player.getSaveData();
            await this.dbPool.query(
                "UPDATE characters SET pos_x = $1, pos_y = $2, pos_z = $3, lookbody = $4, lookfeet = $5, lookhead = $6, looklegs = $7, looktype = $8, direction = $9, health = $10, mana = $11, level = $12 WHERE id = $13",
                [
                    // Se till att dessa är heltal innan de sparas till databasen!
                    parseInt(saveData.pos_x), parseInt(saveData.pos_y), parseInt(saveData.pos_z), 
                    saveData.lookbody, saveData.lookfeet, saveData.lookhead, 
                    saveData.looklegs, saveData.looktype, saveData.direction,
                    saveData.health, saveData.mana, saveData.level,
                    player.id
                ]
            );
            logger.log(`[PlayerManager] Player '${player.name}' (ID: ${player.id}) data saved on disconnect.`);
        } catch (err) {
            logger.error(`[PlayerManager] Failed to save player data on disconnect for ID ${player.id}: ${err.message}`, err);
            // Fortsätt processen att ta bort spelaren även om sparandet misslyckas.
            // Logga felet är tillräckligt här.
        }

        player.isOnline = false; // Markera spelaren som offline
        this.playersBySocketId.delete(socketId);
        this.playersByCharacterId.delete(player.id);
        this.io.emit("playerLeft", { id: player.id }); // Informera andra klienter
        logger.log(`[PlayerManager] Player '${player.name}' (ID: ${player.id}) removed from active list. Remaining players: ${this.getOnlinePlayers().length}`);
        return true;
    }

    /**
     * Hämtar en Player-instans baserat på dess socket ID.
     * @param {string} socketId - Socket ID.
     * @returns {Player|undefined} Player-instansen eller undefined om den inte hittas.
     */
    getPlayerBySocketId(socketId) {
        return this.playersBySocketId.get(socketId);
    }

    /**
     * Hämtar en Player-instans baserat på dess karaktärs ID.
     * @param {number} characterId - Karaktärs ID.
     * @returns {Player|undefined} Player-instansen eller undefined om den inte hittas.
     */
    getPlayerById(characterId) {
        return this.playersByCharacterId.get(Number(characterId));
    }

    /**
     * Returnerar en array med alla inloggade Player-instanser.
     * @returns {Player[]} En array av inloggade spelare.
     */
    getOnlinePlayers() {
        return Array.from(this.playersByCharacterId.values());
    }

    /**
     * Broadcastar en spelares uppdaterade position till alla anslutna klienter.
     * @param {Player} player - Spelaren vars position ska broadcastas.
     */
    broadcastPlayerPosition(player) {
        this.io.emit("playerMoved", player.getPublicData());
    }

    /**
     * Broadcastar ett event till alla anslutna klienter utom en specifik spelare.
     * @param {string} sendingPlayerSocketId - Socket ID för spelaren som inte ska få meddelandet.
     * @param {string} eventName - Namn på eventet.
     * @param {object} data - Data att skicka med eventet.
     */
    broadcastToOthers(sendingPlayerSocketId, eventName, data) {
        this.io.except(sendingPlayerSocketId).emit(eventName, data);
    }

    /**
     * Broadcastar ett event till alla anslutna klienter.
     * @param {string} eventName - Namn på eventet.
     * @param {object} data - Data att skicka med eventet.
     */
    broadcastToAll(eventName, data) {
        this.io.emit(eventName, data);
    }
}

module.exports = PlayerManager;