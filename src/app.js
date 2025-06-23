const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const config = require("./config/config");
const logger = require("./utils/logger");

logger.log("Laddar config...");
const port = config.get("gameProtocolPort", 7172);

logger.log("Kopplar upp mot databas...");

const dbPool = new Pool({
  host: config.get("pg_host"),
  port: config.get("pg_port"),
  database: config.get("pg_database"),
  user: config.get("pg_user"),
  password: config.get("pg_password"),
});

dbPool.connect()
  .then(client => {
    logger.success("Databasen är ansluten!");

    // Starta servern när DB är OK
    const app = express();
    const accountRouter = require('./routes/account');
    app.use(cors());
    app.use(express.json());
    app.use('/api/account', accountRouter);

    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    io.on("connection", (socket) => {
      logger.log(`Spelare ansluten: ${socket.id}`);
      socket.on("disconnect", () => {
        logger.log(`Spelare kopplad från: ${socket.id}`);
      });
    });

    app.get("/", (req, res) => {
      res.send("Swev Server is running!");
    });

    server.listen(port, () => {
      logger.success(`Servern körs på port ${port}`);
    });

    // Släpp klienten
    client.release();
  })
  .catch(err => {
    logger.error("Misslyckades att ansluta till databasen!");
    logger.error(err.message);
    process.exit(1);
  });
