// src/core/GlobalEventLoader.js
const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");
const luaUtils = require('../utils/lua');

class GlobalEventLoader {
    constructor() {
        this.globalEvents = new Map();
        this.activeGameEngineInstance = null; // Lagra GameEngine-instansen här
    }

    // MODIFIERAD: loadAll tar nu `gameEngine` som argument
    async loadAll(gameEngine) { 
        this.activeGameEngineInstance = gameEngine; // Spara instansen

        const globalEventListPath = path.join(__dirname, '..', 'data', 'globalevents', 'globalevents.xml');
        let xmlData;

        try {
            xmlData = await xmlLoader.loadXmlFile(globalEventListPath);
        } catch (err) {
            logger.error(`[GLOBAL_EVENT] Failed to load globalevents.xml: ${err.message}`);
            throw new Error('Could not load fundamental globalevents.xml, server cannot start.');
        }

        let globalEventFileList = [];
        if (xmlData.globalevents?.globalevent) {
            globalEventFileList = Array.isArray(xmlData.globalevents.globalevent) 
                ? xmlData.globalevents.globalevent 
                : [xmlData.globalevents.globalevent];
        } else {
            logger.warn('[GLOBAL_EVENT] No global events found in globalevents.xml or structure is incorrect. Skipping global event loading.');
            return;
        }
        
        for (const entry of globalEventFileList) {
            if (!entry.script || !entry.name || !entry.type) {
                logger.warn('[GLOBAL_EVENT] Global event entry in globalevents.xml is missing "script", "name", or "type" attribute.');
                continue;
            }

            const scriptPath = path.join(__dirname, '..', 'data', 'globalevents', 'scripts', entry.script);
            let L = null;

            try {
                if (path.extname(entry.script) === '.lua') {
                    // VIKTIGT: Skicka med this.activeGameEngineInstance till runLuaFile
                    L = luaUtils.runLuaFile(scriptPath, this.activeGameEngineInstance);
                    
                    if (logger.debug) {
                        logger.debug(`[GLOBAL_EVENT] Loaded and executed Lua script for ${entry.name} (${entry.type}) from ${entry.script}`);
                    } else {
                        logger.log(`[GLOBAL_EVENT] Loaded and executed Lua script for ${entry.name} (${entry.type}) from ${entry.script}`);
                    }

                    const globalEventDefinition = { 
                        name: entry.name,
                        type: entry.type,
                        scriptFile: entry.script,
                        _luaState: L
                    };
                    
                    globalEventDefinition.callLuaFunction = async (functionName, ...args) => {
                        const { lua, to_luastring, to_jsstring } = require("fengari");

                        if (!globalEventDefinition._luaState) {
                            logger.error(`[GLOBAL_EVENT] Lua state not available for calling ${functionName} on ${globalEventDefinition.name}`);
                            return null;
                        }

                        const currentL = globalEventDefinition._luaState;
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
                                    logger.error(`[GLOBAL_EVENT] Error calling Lua function '${functionName}' for ${globalEventDefinition.name}: ${errMsg}`);
                                } else {
                                    const luaResultType = lua.lua_type(currentL, -1);
                                    if (luaResultType === lua.LUA_TBOOLEAN) {
                                        result = !!lua.lua_toboolean(currentL, -1);
                                    } else if (luaResultType === lua.LUA_TSTRING) {
                                        result = to_jsstring(lua.lua_tostring(currentL, -1));
                                    } else if (luaResultType === lua.LUA_TNUMBER) {
                                        result = lua.lua_tonumber(currentL, -1);
                                    }
                                }
                                lua.lua_pop(currentL, 1);
                            } else {
                                logger.warn(`[GLOBAL_EVENT] Lua function '${functionName}' not found for global event: ${globalEventDefinition.name}`);
                                lua.lua_pop(currentL, 1);
                            }
                        } catch (err) {
                            logger.error(`[GLOBAL_EVENT] Unhandled error in callLuaFunction for ${globalEventDefinition.name}: ${err.message}`);
                        }
                        return result;
                    };

                    this.globalEvents.set(globalEventDefinition.name, globalEventDefinition);

                } else {
                    logger.warn(`[GLOBAL_EVENT] Unexpected file type for global event ${entry.name}: ${entry.script}. Expected .lua`);
                    if (L) luaUtils.closeLuaState(L); 
                    continue;
                }
            } catch (err) {
                logger.error(`[GLOBAL_EVENT] Failed to load global event data or script for ${entry.name} from file ${entry.script}: ${err.message}`);
                if (L) luaUtils.closeLuaState(L); 
            }
        }
        
        logger.success(`[GLOBAL_EVENT] Loaded ${this.globalEvents.size} global events!`);
    }

    getGlobalEvent(name) {
        return this.globalEvents.get(name);
    }

    cleanup() {
        this.globalEvents.forEach(event => {
            if (event._luaState) {
                luaUtils.closeLuaState(event._luaState);
                delete event._luaState;
                if (logger.debug) {
                    logger.debug(`[GLOBAL_EVENT] Closed Lua state for ${event.name}`);
                } else {
                    logger.log(`[GLOBAL_EVENT] Closed Lua state for ${event.name}`);
                }
            }
        });
        logger.log("[GLOBAL_EVENT] All Lua states cleaned up.");
    }
}

module.exports = new GlobalEventLoader();