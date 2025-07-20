// src/game/GameEngine.js
const logger = require("../utils/logger");

class GameEngine {
    constructor(playerManager, npcLoader, monsterLoader, worldLoader, io) {
        // Lagra referenser till alla managers och loaders som GameEngine behöver för att fungera.
        // Detta är viktigt för att GameEngine ska kunna interagera med spelare, NPCs, monster och världen.
        this.playerManager = playerManager;
        this.npcLoader = npcLoader;     // För framtida NPC-logik
        this.monsterLoader = monsterLoader; // För framtida monster-logik
        this.worldLoader = worldLoader; // För att få världsinformation
        this.io = io;                   // För globala Socket.IO-broadcasts

        this.tickInterval = null;
        this.tickRate = 200; // Millisekunder per tick. 200ms = 5 ticks/sekund. Justera efter behov.
        logger.log(`[GameEngine] Initialized with tick rate: ${this.tickRate}ms`);
    }

    // Startar spel-loopen
    start() {
        if (this.tickInterval) {
            logger.warn("[GameEngine] Game loop is already running.");
            return;
        }
        this.tickInterval = setInterval(() => this.tick(), this.tickRate);
        logger.success("[GameEngine] Game loop started.");
    }

    // Stoppar spel-loopen
    stop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
            logger.log("[GameEngine] Game loop stopped.");
        }
    }

    // Huvudloopen som körs varje "tick"
    tick() {
        // console.log("[GameEngine] Tick!"); // Avkommentera denna rad för att se varje tick i konsolen

        // Här kommer all din spellogik att uppdateras regelbundet.
        // Börja med att uppdatera alla online-spelare.
        this.playerManager.getOnlinePlayers().forEach(player => {
            // Exempel: Spelarens HP och Mana regenereras varje tick
            // Vi kommer att lägga till dessa metoder i Player.js i nästa steg.
            player.regenHealth();
            player.regenMana();

            // Här kan du lägga till fler spelar-relaterade uppdateringar, t.ex.
            // - Uppdatera buffs/debuffs
            // - Kontrollera om spelaren är i strid
            // - Spara position till DB (om du vill ha frekventa autosaves, annars vid disconnect)
        });

        // Framtida logik för monsters, NPCs, items på marken etc. kommer att placeras här.
        // T.ex:
        // this.monsterManager.updateMonsters();
        // this.npcManager.updateNpcs();
        // this.worldManager.updateDynamicItems();

        // Broadcasta eventuella världsuppdateringar till klienterna.
        // För nu kan vi skicka spelar-stats uppdateringar från Player.js direkt till spelarens socket.
        // Men för mer komplexa uppdateringar (t.ex. monsters som rör sig) skulle de broadcastas härifrån.
    }

    // --- Exempel på metoder som GameEngine kan tillhandahålla för Lua-API eller andra system ---
    // Dessa kan sedan anropas från t.ex. Player.js, NpcLoader, socketHandlers etc.

    /**
     * Teleporterar en varelse till en ny position.
     * Denna metod skulle GameEngine använda för att validera och utföra teleporteringen.
     * Kan anropas från ett Lua-skript via Game.teleportCreature.
     */
    teleportCreature(creatureId, x, y, z) {
        const player = this.playerManager.getPlayerById(creatureId);
        if (player) {
            // Utför rörelsevalidering här om nödvändigt (t.ex. är target-koordinaten walkable?)
            const oldRegionX = Math.floor(player.x / this.worldLoader.worldInfo.region_size);
            const oldRegionY = Math.floor(player.y / this.worldLoader.worldInfo.region_size);

            player.updatePosition(x, y, z, player.direction); // Behåll befintlig riktning vid teleport

            const newRegionX = Math.floor(player.x / this.worldLoader.worldInfo.region_size);
            const newRegionY = Math.floor(player.y / this.worldLoader.worldInfo.region_size);

            // Om spelaren teleporterades till en ny region, ladda regionen och skicka till klienten
            if (oldRegionX !== newRegionX || oldRegionY !== newRegionY || player.z !== z) {
                logger.log(`[GameEngine] Player ${player.id} teleported to new region: (${newRegionX}, ${newRegionY}, ${player.z}). Loading new region.`);
                // Notera: worldLoader.getRegion returnerar en Promise
                this.worldLoader.getRegion(newRegionX, newRegionY, player.z).then(newRegionData => {
                    if (newRegionData) {
                        player.socket.emit("mapUpdate", newRegionData);
                        logger.log(`[GameEngine] Emitted 'mapUpdate' for region (${newRegionX}, ${newRegionY}, ${player.z}) to player ${player.id}.`);
                    }
                }).catch(err => {
                    logger.error(`[GameEngine] Error loading region during teleport for player ${player.id}: ${err.message}`);
                });
            }

            // Informera alla klienter om spelarens nya position
            this.playerManager.broadcastToAll("playerMoved", player.getPublicData());
            logger.log(`[GameEngine] Player ${player.name} (ID: ${creatureId}) teleported to (${x}, ${y}, ${z}).`);
            return true;
        }
        logger.warn(`[GameEngine] Attempted to teleport unknown creatureId: ${creatureId}`);
        return false;
    }

    // Lägg till fler globala Game-funktioner här, t.ex. för att skapa items i världen, spawna monster etc.
}

module.exports = GameEngine;