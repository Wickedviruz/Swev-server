module.exports = function(io, dbPool) {
  const players = new Map();

    io.on("connection", (socket) => {
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
        players.delete(sockId); // Viktigt! Ta bort den gamla från players-map
        }
    }

    dbPool.query("SELECT * FROM characters WHERE id = $1", [characterId])
        .then(result => {
        if (!result.rows.length) {
            logger.warn(`No character found for id ${characterId}`);
            socket.disconnect(true);
            return;
        }
        const character = result.rows[0];

        // Lägg till spelaren i listan
        const playerData = {
            id: character.id,
            name: character.name,
            x: character.pos_x ?? 100,
            y: character.pos_y ?? 100,
            level: character.level,
            health: character.health,
            healthmax: character.healthmax,
            mana: character.mana,
            manamax: character.manamax,
        };
        players.set(socket.id, playerData);

        console.log(`[SERVER] Player ${character.name} (${character.id}) connected`);
        console.log(`[SERVER] Current players count: ${players.size}`);
        console.log(`[SERVER] Sending currentPlayers:`, Array.from(players.values()));

        // Skicka lista på ALLA spelare till nya klienten (med namn)
        socket.emit("currentPlayers", Array.from(players.values()));

        socket.on("requestCurrentPlayers", () => {
            socket.emit("currentPlayers", Array.from(players.values()));
        });

        // Informera ALLA andra att en ny spelare joinat (med namn)
        socket.broadcast.emit("playerJoined", playerData);

        console.log(`[SERVER] Events sent for player ${character.name}`);

        // Ta emot positionsuppdatering
        socket.on("move", (data) => {
            const p = players.get(socket.id);
            if (!p) return;
            p.x = data.x;
            p.y = data.y;
            io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, name: p.name });
        });

        socket.on("takeDamage", (amount) => {
            const player = players.get(socket.id);
            if (!player) return;
            player.health = Math.max(0, player.health - amount);

            // Skicka uppdaterade stats tillbaka till klienten
            socket.emit("playerStats", {
            id: player.id,
            name: player.name,
            level: player.level,
            health: player.health,
            healthmax: player.healthmax,
            mana: player.mana,
            manamax: player.manamax,
            // lägg till fler stats om du vill
            });
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

        // Vid disconnect
        socket.on("disconnect", async () => {
            logger.log(`Player disconnected: ${socket.id} (${character.name})`);
            const leftPlayer = players.get(socket.id);

            if (leftPlayer) {
            try {
                await dbPool.query(
                "UPDATE characters SET pos_x = $1, pos_y = $2 WHERE id = $3",
                [leftPlayer.x, leftPlayer.y, leftPlayer.id]
                );
            } catch (err) {
                logger.error("Failed to save position:", err);
            }
            players.delete(socket.id);
            io.emit("playerLeft", { id: leftPlayer.id });
            }
        });
        })
        .catch(err => {
        logger.error("DB error on character lookup:", err.message);
        socket.disconnect(true);
        });
    });
};
