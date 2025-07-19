const path = require('path');
const fs = require('fs/promises');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger"); // Din befintliga logger
const luaUtils = require('../utils/lua'); // Din lua.js utility

class NpcLoader {
    constructor() {
        this.npcs = new Map();
    }

    async loadAll() {
        const npcListPath = path.join(__dirname, '..', 'data', 'npc', 'npc.xml');
        let xmlData;

        try {
            xmlData = await xmlLoader.loadXmlFile(npcListPath);
        } catch (err) {
            logger.error(`[NPC] Failed to load npc.xml: ${err.message}`);
            throw new Error('Could not load fundamental npc.xml, server cannot start.');
        }

        if (!xmlData.npcs?.npc) {
            logger.warn('[NPC] No NPC files listed in npc.xml or structure is incorrect.');
            return;
        }
        
        const npcFileList = Array.isArray(xmlData.npcs.npc) ? xmlData.npcs.npc : [xmlData.npcs.npc];

        for (const entry of npcFileList) {
            if (!entry.file || !entry.name) {
                logger.warn('[NPC] NPC entry in npc.xml is missing "file" or "name" attribute.');
                continue;
            }

            const scriptPath = path.join(__dirname, '..', 'data', 'npc', entry.file);
            let L = null; // Deklarera L här så den är tillgänglig i catch-blocket

            try {
                if (path.extname(entry.file) === '.lua') {
                    // Kör Lua-filen och få tillbaka Lua-staten (L)
                    L = luaUtils.runLuaFile(scriptPath);
                

                    // Skapa en NPC-definition som innehåller Lua-staten
                    const npcDefinition = { 
                        name: entry.name,
                        _luaState: L // Lagra Lua-staten direkt
                    };
                    
                    // Valfritt: Om du vill ha en snabb referens till t.ex. onGreet utan att behöva
                    // passera hela _luaState till andra delar av koden, kan du skapa en wrapper här.
                    // Denna funktion använder _luaState som är lagrad på npcDefinition.
                    // Den tar emot playerName som argument och anropar Lua-funktionen.
                    npcDefinition.callLuaFunction = async (functionName, ...args) => {
                        const { lua, to_luastring, to_jsstring } = require("fengari"); // Hämta Fengari igen för anrop

                        if (!npcDefinition._luaState) {
                            logger.error(`[NPC] Lua state not available for calling ${functionName} on ${npcDefinition.name}`);
                            return null;
                        }

                        const currentL = npcDefinition._luaState;
                        let result = null;

                        try {
                            // Hämta funktionen från Lua-staten
                            lua.lua_getglobal(currentL, to_luastring(functionName));
                            if (lua.lua_isfunction(currentL, -1)) {
                                // Pusha alla argument till Lua-stacken
                                for (const arg of args) {
                                    // Beroende på argumenttyp, pusha till Lua-stacken
                                    if (typeof arg === 'string') {
                                        lua.lua_pushstring(currentL, to_luastring(arg));
                                    } else if (typeof arg === 'number') {
                                        lua.lua_pushnumber(currentL, arg);
                                    } else if (typeof arg === 'boolean') {
                                        lua.lua_pushboolean(currentL, arg);
                                    }
                                    // Lägg till fler typer om nödvändigt
                                }

                                // Anropa funktionen (args.length argument, 1 returvärde, ingen felhanteringsfunktion på stacken)
                                if (lua.lua_pcall(currentL, args.length, 1, 0) !== lua.LUA_OK) {
                                    const errMsg = to_jsstring(lua.lua_tojsstring(currentL, -1));
                                    logger.error(`[NPC] Error calling Lua function '${functionName}' for ${npcDefinition.name}: ${errMsg}`);
                                } else {
                                    // Hämta returvärdet från stacken
                                    result = to_jsstring(lua.lua_tostring(currentL, -1)); // Antar sträng som returvärde
                                }
                                lua.lua_pop(currentL, 1); // Poppa resultatet/felet
                            } else {
                                logger.warn(`[NPC] Lua function '${functionName}' not found for NPC: ${npcDefinition.name}`);
                                lua.lua_pop(currentL, 1); // Poppa den icke-existerande funktionen
                            }
                        } catch (err) {
                            logger.error(`[NPC] Unhandled error in callLuaFunction for ${npcDefinition.name}: ${err.message}`);
                        }
                        return result;
                    };

                    this.npcs.set(npcDefinition.name, npcDefinition);

                } else {
                    logger.warn(`[NPC] Unexpected file type for NPC ${entry.name}: ${entry.file}. Expected .lua`);
                    // Stäng L här om det inte var en .lua fil men runLuaFile ändå anropades av misstag
                    if (L) luaUtils.closeLuaState(L); 
                    continue;
                }
            } catch (err) {
                logger.error(`[NPC] Failed to load NPC data or script for ${entry.name} from file ${entry.file}: ${err.message}`);
                // Nu är L definierad i scope, så closeLuaState kan anropas säkert
                if (L) luaUtils.closeLuaState(L); 
            }
        }
        
        logger.success(`[NPC] Loaded ${this.npcs.size} npcs!`);
    }

    getNpc(name) {
        return this.npcs.get(name);
    }

    // Lägg till en cleanup-metod för att stänga alla Lua-states när servern stängs
    cleanup() {
        this.npcs.forEach(npc => {
            if (npc._luaState) {
                luaUtils.closeLuaState(npc._luaState);
                delete npc._luaState; // Ta bort referensen
                if (logger.debug) {
                    logger.debug(`[NPC] Closed Lua state for ${npc.name}`);
                } else {
                    logger.info(`[NPC] Closed Lua state for ${npc.name}`);
                }
            }
        });
        logger.info("[NPC] All Lua states cleaned up.");
    }
}

// Exportera en instans av NpcLoader
module.exports = new NpcLoader();