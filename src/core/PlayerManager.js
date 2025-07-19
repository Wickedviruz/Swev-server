// src/game/PlayerManager.js
const Player = require("./Player");
const logger = require("../utils/logger");

class PlayerManager {
    constructor(dbPool, io, worldLoader) {
        this.dbPool = dbPool;
        this.io = io; // Referens till Socket.IO-servern för broadcast
        this.worldLoader = worldLoader; // Behövs för spawn-positioner och regionladdning
        this.playersBySocketId = new Map(); // Karta: socket.id -> Player-instans
        this.playersByCharacterId = new Map(); // Karta: characterId -> Player-instans (snabb uppslagning)
    }

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
            // Skapa en ny Player-instans
            const newPlayer = new Player(characterData, socket);

            this.playersBySocketId.set(socket.id, newPlayer);
            this.playersByCharacterId.set(newPlayer.id, newPlayer);

            logger.log(`[PlayerManager] Character '${newPlayer.name}' (ID: ${newPlayer.id}) successfully loaded and added.`);
            logger.log(`[PlayerManager] Current active players count: ${this.getOnlinePlayers().length}`);

            // Ladda initiala kartregioner för spelaren
            const regionX = Math.floor(newPlayer.x / this.worldLoader.worldInfo.region_size);
            const regionY = Math.floor(newPlayer.y / this.worldLoader.worldInfo.region_size);
            const regionZ = newPlayer.z;

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
            await Promise.all(regionsToLoad.map(r => this.worldLoader.getRegion(r.x, r.y, r.z)));
            logger.log(`[PlayerManager] Loaded initial map regions for player ${newPlayer.id}.`);

            // Skicka initial data till den anslutna klienten
            socket.emit("mapData", { loadedRegions: Array.from(this.worldLoader.regions.values()), player: newPlayer.getPublicData() });
            this.io.emit("playerJoined", newPlayer.getPublicData()); // Broadcast till alla
            socket.emit("currentPlayers", this.getOnlinePlayers().map(p => p.getPublicData())); // Skicka alla online till nya spelaren

            return newPlayer; // Returnera den nya Player-instansen
        } catch (err) {
            logger.error(`[PlayerManager] DB error or WorldLoader error during player login for socket ${socket.id}: ${err.message}`, err);
            return null;
        }
    }

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
                    saveData.pos_x, saveData.pos_y, saveData.pos_z, 
                    saveData.lookbody, saveData.lookfeet, saveData.lookhead, 
                    saveData.looklegs, saveData.looktype, saveData.direction,
                    saveData.health, saveData.mana, saveData.level,
                    player.id
                ]
            );
            logger.log(`[PlayerManager] Player '${player.name}' (ID: ${player.id}) data saved on disconnect.`);
        } catch (err) {
            logger.error(`[PlayerManager] Failed to save player data on disconnect for ID ${player.id}: ${err.message}`, err);
        }

        player.isOnline = false;
        this.playersBySocketId.delete(socketId);
        this.playersByCharacterId.delete(player.id);
        this.io.emit("playerLeft", { id: player.id });
        logger.log(`[PlayerManager] Player '${player.name}' (ID: ${player.id}) removed from active list. Remaining players: ${this.getOnlinePlayers().length}`);
        return true;
    }

    getPlayerBySocketId(socketId) {
        return this.playersBySocketId.get(socketId);
    }

    getPlayerById(characterId) {
        return this.playersByCharacterId.get(Number(characterId));
    }

    getOnlinePlayers() {
        return Array.from(this.playersByCharacterId.values());
    }

    // Metod för att broadcasta en spelares uppdaterade position till alla
    broadcastPlayerPosition(player) {
        this.io.emit("playerMoved", player.getPublicData());
    }

    // Metod för att broadcasta till alla *utom* en specifik spelare
    broadcastToOthers(sendingPlayerSocketId, eventName, data) {
        this.io.except(sendingPlayerSocketId).emit(eventName, data);
    }

    // Metod för att broadcasta till alla
    broadcastToAll(eventName, data) {
        this.io.emit(eventName, data);
    }
}

module.exports = PlayerManager;