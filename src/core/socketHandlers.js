// src/core/socketHandlers.js
const logger = require("../utils/logger");
// Import the new PlayerManager
const PlayerManager = require("../core/PlayerManager"); 

// socketHandlers tar nu PlayerManager-instansen som argument
module.exports = function(io, dbPool, worldLoader) {
    // Instansiera PlayerManager här. Den hanterar spelarna nu.
    const playerManager = new PlayerManager(dbPool, io, worldLoader);

    io.on("connection", async (socket) => {
        const { characterId } = socket.handshake.auth;
        logger.log(`[SOCKET] Player connected with socket ID: ${socket.id}, requested characterId: (${characterId})`);

        if (!characterId) {
            logger.warn(`[SOCKET] Socket ${socket.id} tried to connect without characterId. Disconnecting.`);
            socket.disconnect(true);
            return;
        }

        // Använd PlayerManager för att lägga till spelaren
        const player = await playerManager.addPlayer(socket, characterId);

        if (!player) {
            // Om addPlayer misslyckas (t.ex. characterId inte hittades)
            socket.disconnect(true);
            return;
        }

        // --- Hanterare för inkommande meddelanden från klienten ---

        socket.on("requestCurrentPlayers", () => {
            logger.log(`[SOCKET] Received 'requestCurrentPlayers' from socket: ${socket.id}.`);
            // Spelaren har redan fått listan vid inloggning, men kan begära igen
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

            // Validera rörelsen HÄR (eller i Player.js) innan du uppdaterar
            // Kontrollera om destinationen är gångbar, inte blockerad etc.
            const targetTile = worldLoader.getTile(data.x, data.y, data.z); // Om du har en getTile-metod
            if (!targetTile /* || targetTile.isBlocked() */) { // Exempel
                 logger.warn(`[SOCKET] Player ${p.id} tried to move to blocked tile (${data.x},${data.y},${data.z})`);
                 // Kanske skicka tillbaka spelarens korrekta position till klienten
                 socket.emit("teleport", { x: p.x, y: p.y, z: p.z });
                 return;
            }

            const oldRegionX = Math.floor(p.x / worldLoader.worldInfo.region_size);
            const oldRegionY = Math.floor(p.y / worldLoader.worldInfo.region_size);
            const newRegionX = Math.floor(data.x / worldLoader.worldInfo.region_size);
            const newRegionY = Math.floor(data.y / worldLoader.worldInfo.region_size);

            if (oldRegionX !== newRegionX || oldRegionY !== newRegionY) {
                logger.log(`[SOCKET] Player ${p.id} moved to new region: (${newRegionX}, ${newRegionY}, ${p.z}). Loading new region.`);
                const newRegionData = await worldLoader.getRegion(newRegionX, newRegionY, p.z);
                if (newRegionData) {
                    socket.emit("mapUpdate", newRegionData);
                    logger.log(`[SOCKET] Emitted 'mapUpdate' for region (${newRegionX}, ${newRegionY}, ${p.z}) to socket ${socket.id}.`);
                }
            }

            p.updatePosition(data.x, data.y, data.z, data.direction);
            playerManager.broadcastToAll("playerMoved", p.getPublicData()); // Använd PlayerManager för broadcast
        });

        socket.on("disconnect", async (reason) => {
            logger.log(`[SOCKET] Player disconnected: ${socket.id}. Reason: ${reason}`);
            await playerManager.removePlayer(socket.id); // Använd PlayerManager för att ta bort
        });

        socket.on("takeDamage", (amount) => {
            const player = playerManager.getPlayerBySocketId(socket.id);
            if (!player) return;
            player.takeDamage(amount); // Anropa metoden på Player-instansen
        });

        socket.on("testDamage", () => {
            const player = playerManager.getPlayerBySocketId(socket.id);
            if (!player) return;
            player.takeDamage(1); // Anropa metoden på Player-instansen
        });

        socket.on("chat", ({ name, text }) => {
            const player = playerManager.getPlayerBySocketId(socket.id);
            if (!player) {
                logger.warn(`[SOCKET] Chat from unknown socket: ${socket.id}`);
                return;
            }
            // Implementera chat-hantering. Kanske Game.broadcastChatMessage(playerId, text)
            playerManager.broadcastToAll("chat", { id: player.id, name: player.name, text });
            logger.log(`[CHAT] ${player.name}: ${text}`);
        });

        // Lägg till fler socket-handlers här
        // socket.on("attack", (targetId) => { /* ... */ });
        // socket.on("useItem", (itemId, targetPos) => { /* ... */ });
    });
};