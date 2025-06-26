const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const config = require("./config/config");
const logger = require("./utils/logger");

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

dbPool.connect()
  .then(client => {
    logger.success("Database is connected!");

    // Starta servern när DB är OK
    const app = express();
    const accountRouter = require('./routes/account');
    const characterRouter = require('./routes/character');

    app.use(cors());
    app.use(express.json());
    app.use('/api/account', accountRouter);
    app.use('/api/character', characterRouter);

    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });
    const players = new Map(); // socket.id → playerinfo

io.on("connection", (socket) => {
  const { characterId } = socket.handshake.auth;

  if (!characterId) {
    logger.warn(`Socket ${socket.id} tried to connect without characterId`);
    socket.disconnect(true);
    return;
  }

  // Hämta karaktär (som innan)
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
        x: 100, // Startposition
        y: 100,
      };
      players.set(socket.id, playerData);

      // Skicka lista på ALLA spelare till nya klienten
      socket.emit("currentPlayers", Array.from(players.values()));

      // Informera ALLA andra att en ny spelare joinat
      socket.broadcast.emit("playerJoined", playerData);

      // Ta emot positionsuppdatering
      socket.on("move", (data) => {
        const p = players.get(socket.id);
        if (!p) return;
        p.x = data.x;
        p.y = data.y;
        logger.log(`Player ${p.name} moved to (${p.x}, ${p.y})`);
        io.emit("playerMoved", { id: p.id, x: p.x, y: p.y }); // Skicka till ALLA, inkl. den som flyttade!
      });

      // Vid disconnect
      socket.on("disconnect", () => {
        logger.log(`Player disconnected: ${socket.id} (${character.name})`);
        players.delete(socket.id);
        socket.broadcast.emit("playerLeft", { id: character.id });
      });
    })
    .catch(err => {
      logger.error("DB error on character lookup:", err.message);
      socket.disconnect(true);
    });
});


    server.listen(port, () => {
      logger.success(`Server is running on: ${port}`);
    });

    // Släpp klienten
    client.release();
  })
  .catch(err => {
    logger.error("Failed to connect to database!");
    logger.error(err.message);
    process.exit(1);
  });
