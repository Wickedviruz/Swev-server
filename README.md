# Swev-server

Swev-server is the backend server for **SwevGame** – a modern 2D MMO inspired by classic RPGs, powered by Node.js and TypeScript with real-time WebSocket communication.

The architecture takes inspiration from [Forgotten Server (TFS)](https://github.com/otland/forgottenserver) but is redesigned from scratch for the Node.js ecosystem and integrates seamlessly with the [Swev client](https://github.com/Wickedviruz/Swev-client) (React + Phaser + Tauri).

---

## Features

- **Real-time WebSocket communication**
- **Player management:** login, logout, session handling
- **Map, World, and Entities:** server-authoritative world state, tiles, monsters, and NPCs (work in progress)
- **Event system** for handling in-game events and triggers
- **Database integration** (MongoDB – work in progress)
- **Configuration-driven design** for easy extension
- **Code structure inspired by TFS** for maintainability and scalability

---

## Project Structure

```plaintext
src/
  config/         # World and server configurations
  core/           # Core logic: World, Player, Entity, etc.
  network/        # WebSocket server and protocol logic
  scripts/        # Event handlers and game scripts
  utils/          # Utilities and helpers
  index.ts        # Server entry point
```

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- npm or yarn
- (Optional: MongoDB if you want to test database features)

### Installation

```bash
git clone https://github.com/Wickedviruz/Swev-server.git
cd Swev-server
npm install
```

### Running the Server

```bash
npm start
```

The server will launch on the configured port (default: 8080).

You can adjust server settings in `src/config/server.ts`.

### Connecting the Client

Use the [Swev client](https://github.com/Wickedviruz/Swev-client) to connect and interact with the server.

## Roadmap

- [X] Basic player login/logout
- [ ] Map loading and world state
- [ ] Monster and NPC logic
- [ ] Item handling
- [ ] Database persistence (MongoDB)
- [ ] Combat system
- [ ] Admin commands

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## Credits

Inspired by Forgotten Server and classic MMORPG server architecture.

## License

MIT (see LICENSE file)