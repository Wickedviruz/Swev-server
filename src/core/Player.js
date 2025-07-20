// src/game/Player.js
const logger = require("../utils/logger");

class Player {
    constructor(data, socket) {
        this.id = data.id;
        this.name = data.name;
        this.pos_x = data.pos_x;
        this.pos_y = data.pos_y;
        this.pos_z = data.pos_z;
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
        
        this.socket = socket;
        this.isOnline = true;

        this.inventory = {}; // Placeholder
        this.equipment = {}; // Placeholder

        // Regeneration rates per tick (justera dessa)
        this.healthRegenPerTick = 1; // 1 HP per tick
        this.manaRegenPerTick = 1;   // 1 Mana per tick
        this.lastStatsUpdate = Date.now(); // För att undvika att spamma klienten med uppdateringar
    }

    // --- Spelar-specifika metoder ---

    updatePosition(newX, newY, newZ, direction) {
        this.pos_x = newX;
        this.pos_y = newY;
        this.pos_z = newZ;
        this.direction = direction;
        logger.debug(`Player ${this.name} moved to (${this.pos_x}, ${this.pos_y}, ${this.pos_z})`);
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        logger.log(`Player ${this.name} took ${amount} damage. Health: ${this.health}/${this.healthmax}`);
        this.sendStatsUpdate(); // Skicka stats direkt vid skada
        if (this.health <= 0) {
            this.handleDeath();
        }
    }

    // **NYTT**: Regenererar HP varje GameEngine-tick
    regenHealth() {
        if (this.health < this.healthmax) {
            this.health = Math.min(this.healthmax, this.health + this.healthRegenPerTick);
            this.sendStatsUpdate(); // Skicka uppdatering efter regen
        }
    }

    // **NYTT**: Regenererar Mana varje GameEngine-tick
    regenMana() {
        if (this.mana < this.manamax) {
            this.mana = Math.min(this.manamax, this.mana + this.manaRegenPerTick);
            this.sendStatsUpdate(); // Skicka uppdatering efter regen
        }
    }

    // **NYTT**: Skickar uppdaterade stats till spelarens egen klient
    // Lägg till en enkel debounce för att inte spamma klienten för mycket med stats-uppdateringar
    sendStatsUpdate() {
        const now = Date.now();
        if (now - this.lastStatsUpdate > 500) { // Uppdatera max var 500ms
            this.socket.emit("playerStats", { 
                id: this.id, 
                health: this.health, 
                healthmax: this.healthmax,
                mana: this.mana, 
                manamax: this.manamax,
                level: this.level 
            });
            this.lastStatsUpdate = now;
        }
    }

    addItem(itemId, count = 1) {
        logger.info(`Player ${this.name} received ${count} of item ${itemId}.`);
        this.inventory[itemId] = (this.inventory[itemId] || 0) + count;
        this.socket.emit("inventoryUpdate", { itemId, count, action: "added" });
        return true;
    }

    sendTextMessage(messageType, message) {
        logger.info(`[To Player ${this.name}] Type ${messageType}: ${message}`);
        this.socket.emit("gameMessage", { type: messageType, text: message });
    }

    handleDeath() {
        logger.info(`Player ${this.name} has died!`);
        // Här ska logik för respawn, XP-förlust, meddelanden etc. implementeras
        // Kanske teleportera till spawn-position eller liknande
        this.teleport(this.x, this.y, this.z); // Anropa teleportering här (använd GameEngine)
    }

    // **NYTT**: Teleport-metod på Player-instansen som använder GameEngine.
    // Denna skulle kunna anropas från Lua också via Player:teleport()
    teleport(pos_x, pos_y, pos_z) {
        // Vi behöver tillgång till GameEngine här, vilket är lite knepigt
        // men ett Player-objekt ska inte direkt manipulera GameEngine
        // Istället kan den här metoden bara uppdatera spelarens position,
        // och sedan får GameEngine (eller PlayerManager) hantera
        // broadcast och region-laddning.

        // Men för att direkt anropa GameEngine.teleportCreature från Lua,
        // är det bäst att Lua anropar Game.teleportCreature(player.id, x, y, z)
        // Då slipper Player-klassen känna till GameEngine direkt.

        // För nu kan vi bara uppdatera positionen lokalt
        this.updatePosition(pos_x,pos_y, pos_z, this.direction);
        // Och sedan förvänta oss att något annat system (GameEngine) hanterar synkroniseringen
        // this.socket.emit("teleport", { x, y, z }); // Skicka till egen klient
    }

    getPublicData() {
        return {
            id: this.id,
            name: this.name,
            pos_x: this.pos_x,
            pos_y: this.pos_y,
            pos_z: this.pos_z,
            lookbody: this.lookbody,
            lookfeet: this.lookfeet,
            lookhead: this.lookhead,
            looklegs: this.looklegs,
            looktype: this.looktype,
            direction: this.direction,
            level: this.level,
        };
    }

    getSaveData() {
        return {
            pos_x: this.pos_x,
            pos_y: this.pos_y,
            pos_z: this.pos_z,
            lookbody: this.lookbody,
            lookfeet: this.lookfeet,
            lookhead: this.lookhead,
            looklegs: this.looklegs,
            looktype: this.looktype,
            direction: this.direction,
            health: this.health,
            mana: this.mana,
            level: this.level,
        };
    }
}

module.exports = Player;