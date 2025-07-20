// src/core/NpcLoader.js
const path = require('path');
const fs = require('fs/promises');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");
const luaUtils = require('../utils/lua');

class NpcLoader {
    constructor() {
        this.npcs = new Map();
        this.activeGameEngineInstance = null; // Lagra GameEngine-instansen här
    }

    // MODIFIERAD: loadAll tar nu `gameEngine` som argument
    async loadAll(gameEngine) {
        this.activeGameEngineInstance = gameEngine; // Spara instansen

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
            let L = null;

            try {
                if (path.extname(entry.file) === '.lua') {
                    // VIKTIGT: Skicka med this.activeGameEngineInstance till runLuaFile
                    L = luaUtils.runLuaFile(scriptPath, this.activeGameEngineInstance);
                
                    const npcDefinition = { 
                        name: entry.name,
                        _luaState: L 
                    };
                    
                    npcDefinition.callLuaFunction = async (functionName, ...args) => {
                        const { lua, to_luastring, to_jsstring } = require("fengari");

                        if (!npcDefinition._luaState) {
                            logger.error(`[NPC] Lua state not available for calling ${functionName} on ${npcDefinition.name}`);
                            return null;
                        }

                        const currentL = npcDefinition._luaState;
                        let result = null;

                        try {
                            lua.lua_getglobal(currentL, to_luastring(functionName));
                            if (lua.lua_isfunction(currentL, -1)) {
                                for (const arg of args) {
                                    if (typeof arg === 'string') {
                                        lua.lua_pushstring(currentL, to_luastring(arg));
                                    } else if (typeof arg === 'number') {
                                        lua.lua_pushnumber(currentL, arg);
                                    } else if (typeof arg === 'boolean') {
                                        lua.lua_pushboolean(currentL, arg);
                                    }
                                }

                                if (lua.lua_pcall(currentL, args.length, 1, 0) !== lua.LUA_OK) {
                                    const errMsg = to_jsstring(lua.lua_tojsstring(currentL, -1));
                                    logger.error(`[NPC] Error calling Lua function '${functionName}' for ${npcDefinition.name}: ${errMsg}`);
                                } else {
                                    result = to_jsstring(lua.lua_tostring(currentL, -1));
                                }
                                lua.lua_pop(currentL, 1);
                            } else {
                                logger.warn(`[NPC] Lua function '${functionName}' not found for NPC: ${npcDefinition.name}`);
                                lua.lua_pop(currentL, 1);
                            }
                        } catch (err) {
                            logger.error(`[NPC] Unhandled error in callLuaFunction for ${npcDefinition.name}: ${err.message}`);
                        }
                        return result;
                    };

                    this.npcs.set(npcDefinition.name, npcDefinition);

                } else {
                    logger.warn(`[NPC] Unexpected file type for NPC ${entry.name}: ${entry.file}. Expected .lua`);
                    if (L) luaUtils.closeLuaState(L); 
                    continue;
                }
            } catch (err) {
                logger.error(`[NPC] Failed to load NPC data or script for ${entry.name} from file ${entry.file}: ${err.message}`);
                if (L) luaUtils.closeLuaState(L); 
            }
        }
        
        logger.success(`[NPC] Loaded ${this.npcs.size} npcs!`);
    }

    getNpc(name) {
        return this.npcs.get(name);
    }

    cleanup() {
        this.npcs.forEach(npc => {
            if (npc._luaState) {
                luaUtils.closeLuaState(npc._luaState);
                delete npc._luaState;
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

module.exports = new NpcLoader();