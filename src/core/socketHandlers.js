// src/core/socketHandlers.js
const logger = require("../utils/logger");
const PlayerManager = require("../core/PlayerManager"); // Importera PlayerManager-klassen

// Denna funktion tar io, dbPool och worldLoader, skapar PlayerManager och returnerar den.
// **MODIFIERAD**: Returnerar playerManager-instansen.
module.exports = function(io, dbPool, worldLoader) {
    const playerManager = new PlayerManager(dbPool, io, worldLoader);

    io.on("connection", async (socket) => {
        const { characterId } = socket.handshake.auth;
        logger.log(`[SOCKET] Player connected with socket ID: ${socket.id}, requested characterId: (${characterId})`);

        if (!characterId) {
            logger.warn(`[SOCKET] Socket ${socket.id} tried to connect without characterId. Disconnecting.`);
            socket.disconnect(true);
            return;
        }

        const player = await playerManager.addPlayer(socket, characterId);

        if (!player) {
            socket.disconnect(true);
            return;
        }

        // --- Hanterare för inkommande meddelanden från klienten ---

        socket.on("requestCurrentPlayers", () => {
            logger.log(`[SOCKET] Received 'requestCurrentPlayers' from socket: ${socket.id}.`);
            const requesterPlayer = playerManager.getPlayerBySocketId(socket.id);
            if (requesterPlayer) {
                socket.emit("currentPlayers", playerManager.getOnlinePlayers().map(p => p.getPublicData()));
            } else {
                logger.warn(`[SOCKET] requestCurrentPlayers from unknown/not fully logged in socket: ${socket.id}`);
            }
        });

        socket.on("move", async (data) => {
            const p = playerManager.getPlayerBySocketId(socket.id);
            if (!p) {
                logger.warn(`[SOCKET] Move request from unknown socket: ${socket.id}`);
                return;
            }

            // Flytta valideringslogik till en dedikerad World/MovementManager eller GameEngine.
            // För nu, enkel validering
            const targetTile = worldLoader.getTile(data.x, data.y, data.z); // Du behöver en getTile-metod i WorldLoader eller WorldManager
            if (!targetTile /* || !targetTile.isWalkable() */) {
                logger.warn(`[SOCKET] Player ${p.id} tried to move to blocked tile (${data.x},${data.y},${data.z})`);
                socket.emit("teleport", { x: p.x, y: p.y, z: p.z }); // Skicka tillbaka korrekt position
                return;
            }

            const oldRegionX = Math.floor(p.x / worldLoader.worldInfo.region_size);
            const oldRegionY = Math.floor(p.y / worldLoader.worldInfo.region_size);
            const newRegionX = Math.floor(data.x / worldLoader.worldInfo.region_size);
            const newRegionY = Math.floor(data.y / worldLoader.worldInfo.region_size);

            if (oldRegionX !== newRegionX || oldRegionY !== newRegionY || p.z !== data.z) { // Kontrollera även Z
                logger.log(`[SOCKET] Player ${p.id} moved to new region/floor: (${newRegionX}, ${newRegionY}, ${data.z}). Loading new region.`);
                const newRegionData = await worldLoader.getRegion(newRegionX, newRegionY, data.z);
                if (newRegionData) {
                    socket.emit("mapUpdate", newRegionData);
                    logger.log(`[SOCKET] Emitted 'mapUpdate' for region (${newRegionX}, ${newRegionY}, ${data.z}) to socket ${socket.id}.`);
                }
            }
            
            p.updatePosition(data.x, data.y, data.z, data.direction);
            playerManager.broadcastToAll("playerMoved", p.getPublicData());
        });

        socket.on("disconnect", async (reason) => {
            logger.log(`[SOCKET] Player disconnected: ${socket.id}. Reason: ${reason}`);
            await playerManager.removePlayer(socket.id);
        });

        socket.on("takeDamage", (amount) => {
            const player = playerManager.getPlayerBySocketId(socket.id);
            if (!player) return;
            player.takeDamage(amount);
        });

        socket.on("testDamage", () => {
            const player = playerManager.getPlayerBySocketId(socket.id);
            if (!player) return;
            player.takeDamage(10); // Ge mer testskada för att se det hända
        });

        socket.on("chat", ({ name, text }) => {
            const player = playerManager.getPlayerBySocketId(socket.id);
            if (!player) {
                logger.warn(`[SOCKET] Chat from unknown socket: ${socket.id}`);
                return;
            }
            playerManager.broadcastToAll("chat", { id: player.id, name: player.name, text });
            logger.log(`[CHAT] ${player.name}: ${text}`);
        });
    });

    return playerManager; // **NYTT**: Returnera playerManager-instansen
};