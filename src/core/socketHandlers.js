// src/core/socketHandlers.js

const logger = require("../utils/logger");

module.exports = function(io, dbPool, worldLoader) {
    // Denna 'players' Map håller reda på alla inloggade spelare och är delad mellan alla sockets.
    // VIKTIGT: Nyckeln i denna Map bör vara characterId, inte socket.id om du vill kunna söka snabbt.
    // Men om du vill mappa socket.id till playerData direkt, kan vi behålla den som den är
    // och lägga till en omvänd mappning om det behövs för snabb sökning med characterId.
    // Låt oss hålla den som socket.id för enkelhetens skull, men var medveten om det.
    const players = new Map(); // Karta: socket.id -> playerData

    io.on("connection", async (socket) => {
        const { characterId } = socket.handshake.auth;
        logger.log(`[SOCKET] Player connected with socket ID: ${socket.id}, requested characterId: (${characterId})`);

        if (!characterId) {
            logger.warn(`[SOCKET] Socket ${socket.id} tried to connect without characterId. Disconnecting.`);
            socket.disconnect(true);
            return;
        }

        // Hantera fall där en spelare redan är inloggad med samma characterId.
        // Hitta den gamla socketen baserat på characterId
        let existingSocketId = null;
        for (const [sockId, player] of players) {
            if (player.id === Number(characterId)) {
                existingSocketId = sockId;
                break;
            }
        }

        if (existingSocketId) {
            logger.log(`[SOCKET] Duplicate login detected for characterId ${characterId}. Disconnecting previous socket: ${existingSocketId}`);
            io.sockets.sockets.get(existingSocketId)?.disconnect(true); // Koppla bort den gamla socketen
            players.delete(existingSocketId); // Ta bort den gamla spelaren från listan
        }

        let playerData; // Deklarera playerData här så den är tillgänglig i hela 'connection'-scope:t

        try {
            const result = await dbPool.query("SELECT * FROM characters WHERE id = $1", [characterId]);

            if (!result.rows.length) {
                logger.warn(`[SOCKET] No character found in DB for ID: ${characterId}. Disconnecting socket: ${socket.id}`);
                socket.disconnect(true);
                return;
            }

            const character = result.rows[0];

            playerData = {
                id: character.id,
                name: character.name,
                x: character.pos_x ?? worldLoader.worldInfo.spawn_x,
                y: character.pos_y ?? worldLoader.worldInfo.spawn_y,
                z: character.pos_z ?? worldLoader.worldInfo.spawn_z,
                lookbody: character.lookbody ?? 0,
                lookfeet: character.lookfeet ?? 0,
                lookhead: character.lookhead ?? 0,
                looklegs: character.looklegs ?? 0,
                looktype: character.looktype ?? 0,
                direction: character.direction ?? 2,
                level: character.level,
                health: character.health,
                healthmax: character.healthmax,
                mana: character.mana,
                manamax: character.manamax,
            };

            players.set(socket.id, playerData); // Lägg till den nya spelaren i Map

            logger.log(`[SOCKET] Character '${playerData.name}' (ID: ${playerData.id}) successfully loaded and added to active players.`);
            logger.log(`[SOCKET] Current active players count: ${players.size}`);

            // Ladda spelarens initiala region och omgivande regioner.
            const regionX = Math.floor(playerData.x / worldLoader.worldInfo.region_size);
            const regionY = Math.floor(playerData.y / worldLoader.worldInfo.region_size);
            const regionZ = playerData.z;

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

            await Promise.all(regionsToLoad.map(r => worldLoader.getRegion(r.x, r.y, r.z)));
            logger.log(`[SOCKET] Loaded initial map regions for player ${playerData.id}.`);

            // Skicka kartdata till den anslutna klienten.
            socket.emit("mapData", { loadedRegions: Array.from(worldLoader.regions.values()), player: playerData });
            logger.log(`[SOCKET] Emitted 'mapData' to socket ${socket.id}.`);

            // Informera alla *andra* klienter att en ny spelare har anslutit.
            socket.broadcast.emit("playerJoined", playerData);
            logger.log(`[SOCKET] Broadcasted 'playerJoined' for player ${playerData.id}.`);

            // SKICKA "currentPlayers" EVENTET TILL DEN NYANSLUTNA KLIENTEN HÄR!
            // Nu när playerData är satt och spelaren lagts till i 'players' Map,
            // kan vi skicka den fullständiga listan över aktiva spelare.
            // Detta är vad klientens GamePage.tsx väntar på.
            socket.emit("currentPlayers", Array.from(players.values()));
            logger.log(`[SOCKET] Emitted 'currentPlayers' to new player ${playerData.id} (socket ${socket.id}).`);

        } catch (err) {
            logger.error(`[SOCKET] DB error during character lookup or region loading for socket ${socket.id}: ${err.message}`, err);
            socket.disconnect(true);
            return;
        }

        // Hanterare för 'requestCurrentPlayers' eventet
        // Detta ska fungera som en backup eller förfrågan, men den initiala listan skickas ovan.
        socket.on("requestCurrentPlayers", () => {
            logger.log(`[SOCKET] Received 'requestCurrentPlayers' from socket: ${socket.id}. Sending current players data.`);
            // Se till att playerData är tillgänglig om spelaren är fullt inloggad
            const requesterPlayerData = players.get(socket.id);
            if (requesterPlayerData) {
                socket.emit("currentPlayers", Array.from(players.values()));
            } else {
                logger.warn(`[SOCKET] requestCurrentPlayers from unknown/not fully logged in socket: ${socket.id}`);
            }
        });

        // --- Övriga socket-händelser ---

        socket.on("move", async (data) => {
            const p = players.get(socket.id);
            if (!p) {
                logger.warn(`[SOCKET] Move request from unknown socket: ${socket.id}`);
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

            p.x = data.x;
            p.y = data.y;
            p.direction = data.direction;

            io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, direction: p.direction, looktype: p.looktype }); // Inkludera looktype här för andra spelare
        });

        socket.on("disconnect", async (reason) => {
            const leftPlayer = players.get(socket.id);
            logger.log(`[SOCKET] Player disconnected: ${socket.id}. Reason: ${reason}`);

            if (leftPlayer) {
                try {
                    await dbPool.query(
                        "UPDATE characters SET pos_x = $1, pos_y = $2, pos_z = $3, lookbody = $4, lookfeet = $5, lookhead = $6, looklegs = $7, looktype = $8, direction = $9 WHERE id = $10",
                        [
                            leftPlayer.x,
                            leftPlayer.y,
                            leftPlayer.z,
                            leftPlayer.lookbody,
                            leftPlayer.lookfeet,
                            leftPlayer.lookhead,
                            leftPlayer.looklegs,
                            leftPlayer.looktype,
                            leftPlayer.direction,
                            leftPlayer.id
                        ]
                    );
                    logger.log(`[SOCKET] Player '${leftPlayer.name}' (ID: ${leftPlayer.id}) data saved on disconnect.`);
                } catch (err) {
                    logger.error(`[SOCKET] Failed to save player data on disconnect for ID ${leftPlayer.id}: ${err.message}`, err);
                }
                players.delete(socket.id);
                io.emit("playerLeft", { id: leftPlayer.id });
                logger.log(`[SOCKET] Player '${leftPlayer.name}' (ID: ${leftPlayer.id}) removed from active list. Remaining players: ${players.size}`);
            }
        });

        socket.on("takeDamage", (amount) => {
            const player = players.get(socket.id);
            if (!player) return;
            player.health = Math.max(0, player.health - amount);
            socket.emit("playerStats", { ...player });
            logger.log(`[SOCKET] Player ${player.id} took ${amount} damage. Health: ${player.health}`);
        });

        socket.on("testDamage", () => {
            const player = players.get(socket.id);
            if (!player) return;
            player.health = Math.max(0, player.health - 1);
            socket.emit("playerStats", { ...player });
            logger.log(`[SOCKET] Test damage applied to player ${player.id}. Health: ${player.health}`);
        });

        socket.on("chat", ({ name, text }) => {
            const player = players.get(socket.id); // Hämta playerData från Map
            if (!player) {
                logger.warn(`[SOCKET] Chat from unknown socket: ${socket.id}`);
                return;
            }
            // Använd spelarens faktiska ID från playerData, inte ett potentiellt undefined playerData.id
            io.emit("chat", { id: player.id, name, text });
            logger.log(`[CHAT] ${name}: ${text}`);
        });
    });
};