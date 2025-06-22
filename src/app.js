const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const config = require("./config/config");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const port = config.get("port", 3000);

io.on("connection", (socket) => {
  console.log("Spelare ansluten:", socket.id);

  socket.on("disconnect", () => {
    console.log("Spelare kopplad från:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Swev Server is running!");
});

server.listen(config.port, () => {
  console.log(`Servern körs på port ${config.port}`);
});
