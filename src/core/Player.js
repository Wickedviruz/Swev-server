// src/game/Player.js
const logger = require("../utils/logger");

class Player {
    constructor(data, socket) {
        // Initiera med data från databasen
        this.id = data.id;
        this.name = data.name;
        this.x = data.pos_x;
        this.y = data.pos_y;
        this.z = data.pos_z;
        this.lookbody = data.lookbody;
        this.lookfeet = data.lookfeet;
        this.lookhead = data.lookhead;
        this.looklegs = data.looklegs;
        this.looktype = data.looktype;
        this.direction = data.direction;
        this.level = data.level;
        this.health = data.health;
        this.healthmax = data.healthmax;
        this.mana = data.mana;
        this.manamax = data.manamax;
        
        // Specifik Socket.IO-anslutning för denna spelare
        this.socket = socket;
        this.isOnline = true;

        // Lägg till andra attribut som inventarier, utrustning, buffar/debuffar etc. här
        this.inventory = {}; // En enkel placeholder för nu
        this.equipment = {}; // Enkel placeholder
    }

    // --- Spelar-specifika metoder ---

    // Metod för att uppdatera position
    updatePosition(newX, newY, newZ, direction) {
        this.x = newX;
        this.y = newY;
        this.z = newZ;
        this.direction = direction;
        // Här kan du lägga till validering av rörelsen om det behövs
        logger.debug(`Player ${this.name} moved to (${this.x}, ${this.y}, ${this.z})`);
        // Klienten får uppdateringen via PlayerManager
    }

    // Metod för att ta skada
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        logger.log(`Player ${this.name} took ${amount} damage. Health: ${this.health}/${this.healthmax}`);
        // Skicka uppdaterade stats till spelarens egen klient
        this.socket.emit("playerStats", { 
            id: this.id, 
            health: this.health, 
            mana: this.mana, 
            level: this.level 
            // etc.
        });
        // Kontrollera för död, etc.
        if (this.health <= 0) {
            this.handleDeath();
        }
    }

    // Metod för att lägga till item
    addItem(itemId, count = 1) {
        logger.info(`Player ${this.name} received ${count} of item ${itemId}.`);
        // Implementera riktig inventarielogik här
        this.inventory[itemId] = (this.inventory[itemId] || 0) + count;
        this.socket.emit("inventoryUpdate", { itemId, count, action: "added" });
        return true;
    }

    // Metod för att skicka meddelande till spelaren
    sendTextMessage(messageType, message) {
        logger.info(`[To Player ${this.name}] Type ${messageType}: ${message}`);
        this.socket.emit("gameMessage", { type: messageType, text: message });
    }

    // Metod för att hantera död (Placeholder)
    handleDeath() {
        logger.info(`Player ${this.name} has died!`);
        // Här ska logik för respawn, XP-förlust, meddelanden etc. implementeras
    }

    // Skicka en delmängd av data för broadcast till andra klienter
    getPublicData() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            z: this.z,
            lookbody: this.lookbody,
            lookfeet: this.lookfeet,
            lookhead: this.lookhead,
            looklegs: this.looklegs,
            looktype: this.looktype,
            direction: this.direction,
            level: this.level,
            // Inkludera endast publik information
        };
    }

    // Hämta all data för sparning till DB
    getSaveData() {
        return {
            pos_x: this.x,
            pos_y: this.y,
            pos_z: this.z,
            lookbody: this.lookbody,
            lookfeet: this.lookfeet,
            lookhead: this.lookhead,
            looklegs: this.looklegs,
            looktype: this.looktype,
            direction: this.direction,
            health: this.health,
            mana: this.mana,
            level: this.level,
            // ... andra sparade attribut ...
        };
    }
}

module.exports = Player;