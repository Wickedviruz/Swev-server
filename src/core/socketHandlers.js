const logger = require("../utils/logger");

module.exports = function(io, dbPool, worldLoader) {
    const players = new Map();

    io.on("connection", async (socket) => {
        const { characterId } = socket.handshake.auth;
        logger.log(`Player connected: (${characterId})`);

        if (!characterId) {
            logger.warn(`Socket ${socket.id} tried to connect without characterId`);
            socket.disconnect(true);
            return;
        }

        // Kolla om någon redan är inloggad med samma characterId, "kasta ut" den gamla
        for (const [sockId, player] of players) {
            if (player.id === Number(characterId)) {
                logger.log(`Duplicate login detected for characterId ${characterId}, disconnecting previous socket: ${sockId}`);
                io.sockets.sockets.get(sockId)?.disconnect(true);
                players.delete(sockId);
            }
        }
        
        try {
            const result = await dbPool.query("SELECT * FROM characters WHERE id = $1", [characterId]);

            if (!result.rows.length) {
                logger.warn(`No character found for id ${characterId}`);
                socket.disconnect(true);
                return;
            }
            const character = result.rows[0];

            const playerData = {
                id: character.id,
                name: character.name,
                x: character.pos_x ?? worldLoader.worldInfo.spawn_x,
                y: character.pos_y ?? worldLoader.worldInfo.spawn_y,
                z: character.pos_z ?? worldLoader.worldInfo.spawn_z,
                looktype: character.looktype ?? 0,
                direction: character.direction ?? 2,
                level: character.level,
                health: character.health,
                healthmax: character.healthmax,
                mana: character.mana,
                manamax: character.manamax,
            };
            players.set(socket.id, playerData);

            // Ladda spelarens initiala region och omgivande regioner
            const regionX = Math.floor(playerData.x / worldLoader.worldInfo.region_size);
            const regionY = Math.floor(playerData.y / worldLoader.worldInfo.region_size);
            const regionZ = playerData.z;

            // En lista med regioner att ladda vid anslutning (aktuell + omgivande)
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

            // Ladda alla regioner parallellt
            await Promise.all(regionsToLoad.map(r => worldLoader.getRegion(r.x, r.y, r.z)));

            // Skicka ut all data
            socket.emit("mapData", { loadedRegions: Array.from(worldLoader.regions.values()), player: playerData });
            socket.emit("currentPlayers", Array.from(players.values()));
            socket.broadcast.emit("playerJoined", playerData);

            logger.info(`[SERVER] Player ${character.name} (${character.id}) connected`);
            logger.info(`[SERVER] Current players count: ${players.size}`);
        
        } catch (err) {
            logger.error("DB error on character lookup:", err.message);
            socket.disconnect(true);
        }

        socket.on("move", async (data) => {
            const p = players.get(socket.id);
            if (!p) return;

            const oldRegionX = Math.floor(p.x / worldLoader.worldInfo.region_size);
            const oldRegionY = Math.floor(p.y / worldLoader.worldInfo.region_size);
            const newRegionX = Math.floor(data.x / worldLoader.worldInfo.region_size);
            const newRegionY = Math.floor(data.y / worldLoader.worldInfo.region_size);
            
            // Kolla om regionen har ändrats
            if (oldRegionX !== newRegionX || oldRegionY !== newRegionY) {
                // Ladda den nya regionen och skicka till klienten
                const newRegionData = await worldLoader.getRegion(newRegionX, newRegionY, p.z);
                if (newRegionData) {
                    socket.emit("mapUpdate", newRegionData);
                }
            }

            p.x = data.x;
            p.y = data.y;
            p.direction = data.direction;
            io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, direction: p.direction });
        });
        
        socket.on("disconnect", async () => {
            const leftPlayer = players.get(socket.id);
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
                    logger.info(`Player ${leftPlayer.name} saved and disconnected.`);
                } catch (err) {
                    logger.error("Failed to save player data on disconnect:", err);
                }
                players.delete(socket.id);
                io.emit("playerLeft", { id: leftPlayer.id });
            }
        });

        // Övriga händelser, som chat, takeDamage, etc.
        // ...
        socket.on("takeDamage", (amount) => {
            const player = players.get(socket.id);
            if (!player) return;
            player.health = Math.max(0, player.health - amount);
            socket.emit("playerStats", { ...player });
        });

        socket.on("testDamage", () => {
            const player = players.get(socket.id);
            if (!player) return;
            player.health = Math.max(0, player.health - 1);
            socket.emit("playerStats", { ...player });
        });

        socket.on("chat", ({ name, text }) => {
            io.emit("chat", { id: playerData.id, name, text });
        });
        
    });
};