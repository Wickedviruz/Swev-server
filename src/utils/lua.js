const { lua, lauxlib, lualib, to_luastring, to_jsstring, to_luavalue } = require("fengari");
const fs = require("fs");
const logger = require("./logger"); // Antar att din logger är i samma utils-mapp

// --- Hjälpfunktioner för konvertering mellan Lua och JS ---

// Konverterar ett Lua-värde på en specifik stack-position till ett JS-värde
function fromLuaValue(L, idx) {
    const type = lua.lua_type(L, idx);
    switch (type) {
        case lua.LUA_TBOOLEAN:
            return !!lua.lua_toboolean(L, idx);
        case lua.LUA_TNUMBER:
            return lua.lua_tonumber(L, idx);
        case lua.LUA_TSTRING:
            return to_jsstring(lua.lua_tostring(L, idx));
        case lua.LUA_TTABLE:
            return getLuaTableAsJsObject(L, idx); // Rekursivt för tabeller
        case lua.LUA_TNIL:
            return null;
        case lua.LUA_TUSERDATA:
            // Om du har egna C-objekt (userdata) i Lua som representerar t.ex. Player/Item-instanser
            // Du kan lägga till logik här för att hämta det underliggande JS-objektet
            // For now, return undefined or a placeholder
            return undefined;
        default:
            return undefined; // Funktioner, trådar, etc. kan inte direkt konverteras till JS-primitiver
    }
}

// Konverterar ett JS-värde till ett Lua-värde och pushar det till stacken
function toLuaValue(L, value) {
    if (value === null || value === undefined) {
        lua.lua_pushnil(L);
    } else if (typeof value === 'boolean') {
        lua.lua_pushboolean(L, value);
    } else if (typeof value === 'number') {
        lua.lua_pushnumber(L, value);
    } else if (typeof value === 'string') {
        lua.lua_pushstring(L, to_luastring(value));
    } else if (typeof value === 'object') {
        // För JS-objekt (inklusive arrayer), konvertera till Lua-tabell
        lua.lua_newtable(L);
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                lua.lua_pushstring(L, to_luastring(key)); // Push nyckel
                toLuaValue(L, value[key]); // Rekursivt push värde
                lua.lua_settable(L, -3); // Sätter nyckel-värde-par i tabellen
            }
        }
    } else {
        // För andra typer, pusha nil eller kasta fel
        lua.lua_pushnil(L);
    }
}

// --- Funktioner för att exponera JS-funktioner och konstanter till Lua ---

// Exponerar en samling JavaScript-funktioner till en Lua-state
function injectJsFunctions(L, functionsMap) {
    for (const [name, func] of Object.entries(functionsMap)) {
        // Kontrollera om funktionen är en "C-funktion" (Fengari-stil, tar L som första arg)
        // eller en vanlig JS-funktion.
        // För nuvarande upplägg med lua_broadcastMessage/lua_addEvent, är det "C-funktioner".
        lua.lua_pushjsfunction(L, func);
        // Ställ in funktionen som en global variabel i Lua
        lua.lua_setglobal(L, to_luastring(name));
    }
}

// Exponerar en samling JavaScript-konstanter till en Lua-state
function injectJsConstants(L, constantsMap) {
    for (const [name, value] of Object.entries(constantsMap)) {
        toLuaValue(L, value); // Push värdet till Lua-stacken
        lua.lua_setglobal(L, to_luastring(name)); // Ställ in det som en global variabel
    }
}

// --- "C-funktioner" för Lua-API (implementerade i JS) ---

/**
 * Game.broadcastMessage(message, messageType)
 * Broadcastar ett meddelande till alla spelare i spelet.
 */
function lua_broadcastMessage(L) {
    const message = to_jsstring(lauxlib.luaL_checkstring(L, 1)); // Argument 1: meddelande (sträng)
    // Argument 2 är valfritt, standard till 0 (MESSAGE_STATUS_DEFAULT)
    const messageType = lauxlib.luaL_optnumber(L, 2, 0); 

    logger.info(`[LUA Broadcast] Type ${messageType}: ${message}`);
    // Här skulle du implementera den faktiska sändningslogiken, t.ex. via Socket.IO
    // io.emit('game_message', { type: messageType, text: message });

    return 0; // Inga returvärden till Lua
}

/**
 * addEvent(func, delay, ...)
 * Schemalägger en Lua-funktion att anropas efter en viss fördröjning.
 */
function lua_addEvent(L) {
    // Kontrollera att första argumentet är en funktion och andra är ett nummer
    lauxlib.luaL_checktype(L, 1, lua.LUA_TFUNCTION);
    const delay = lauxlib.luaL_checknumber(L, 2);

    // Spara en referens till Lua-funktionen i registret för framtida anrop
    // luaL_ref poppar funktionen från stacken efter att ha skapat referensen
    const funcRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);

    // Samla eventuella extra argument som ska skickas till den schemalagda funktionen
    const numArgs = lua.lua_gettop(L) - 2; // Argument utöver func och delay
    const argsToPass = [];
    for (let i = 0; i < numArgs; i++) {
        // Läs av argumenten från stacken, börjar vid index 3 (efter func och delay)
        argsToPass.push(fromLuaValue(L, 3 + i)); 
    }

    setTimeout(() => {
        // Hämta den sparade funktionen från registret och pusha den till stacken
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, funcRef);

        // Pusha de sparade argumenten till Lua-stacken
        for (const arg of argsToPass) {
            toLuaValue(L, arg);
        }

        // Anropa den schemalagda Lua-funktionen
        if (lua.lua_pcall(L, argsToPass.length, 0, 0) !== lua.LUA_OK) { // Inga returvärden för addEvent callbacks
            const errMsg = to_jsstring(lua.lua_tostring(L, -1)); // Felmeddelandet ligger på stacken
            logger.error(`[LUA Event Callback Error] in addEvent: ${errMsg}`);
            lua.lua_pop(L, 1); // Poppa felmeddelandet
        }

        // Frigör referensen till funktionen i registret när den har anropats
        lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, funcRef);
    }, delay);

    return 0; // Inga returvärden till Lua
}

// --- Huvudfunktion för att köra Lua-filer ---

function runLuaFile(filePath) {
    const code = fs.readFileSync(filePath, "utf8");
    const L = lauxlib.luaL_newstate(); // Skapa en ny, isolerad Lua-state
    lualib.luaL_openlibs(L); // Öppna standard Lua-bibliotek (io, os, math, etc.)

    // Exponera globala JavaScript-funktioner som Lua-skript kan använda
    injectJsFunctions(L, {
        "Game.broadcastMessage": lua_broadcastMessage,
        "addEvent": lua_addEvent,
        // Lägg till fler API-funktioner här allt eftersom du bygger ut dem
        // Exempel: "Player.teleport": lua_player_teleport
    });

    // Exponera globala konstanter
    injectJsConstants(L, {
        "MESSAGE_STATUS_DEFAULT": 0,
        "MESSAGE_STATUS_CONSOLE_LIGHTBLUE": 1,
        "MESSAGE_STATUS_GREEN": 2,
        "MESSAGE_STATUS_RED": 3,
        // Lägg till fler konstanter här (t.ex. ITEM_ID_GOLD)
    });

    // Ladda och kör Lua-koden
    if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK) {
        const errorMsg = to_jsstring(lua.lua_tojsstring(L, -1));
        lua.lua_close(L);
        throw new Error(`Lua syntax error in ${filePath}: ${errorMsg}`);
    }
    if (lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
        const errorMsg = to_jsstring(lua.lua_tojsstring(L, -1));
        lua.lua_close(L);
        throw new Error(`Lua runtime error in ${filePath}: ${errorMsg}`);
    }
    return L;
}

// --- Befintliga funktioner för att hämta data från Lua till JS ---

// Konverterar en Lua-tabell till ett JavaScript-objekt/array
// Förutsätter att tabellen ligger överst på Lua-stacken när den anropas,
// eller att 'idx' pekar på tabellen.
function getLuaTableAsJsObject(L, idx = -1) {
    const jsObject = {};

    // Säkra att vi har ett absolut index för tabellen om det behövs
    const tableIndex = lua.lua_absindex(L, idx); 

    lua.lua_pushnil(L); // Pushar nil för att starta iterationen
    // loopar tills lua.lua_next returnerar 0 (false)
    while (lua.lua_next(L, tableIndex) !== 0) {
        // Nu ligger key på -2 och value på -1 relativt till stackens topp
        const key = fromLuaValue(L, -2); // Använd fromLuaValue för nyckel också
        const value = fromLuaValue(L, -1); // Använd fromLuaValue för värde

        // Hantera numeriska nycklar för att skapa arrayer om lämpligt
        if (typeof key === 'number' && key === Math.floor(key) && key > 0) {
            // Om nyckeln är ett positivt heltal, behandla det som en array-index
            if (!Array.isArray(jsObject)) { // Konvertera till array om det inte redan är det
                const tempArray = Object.values(jsObject); // Behåll befintliga element
                jsObject = tempArray; // Ersätt objektet med en array
            }
            jsObject[key - 1] = value; // Lua-index är 1-baserade, JS är 0-baserade
        } else {
            jsObject[key] = value;
        }
        lua.lua_pop(L, 1); // Poppa värdet, lämnar nyckeln för nästa iteration
    }
    return jsObject;
}

// Hämtar en global variabel från en Lua-state och konverterar den till JS
function getLuaGlobal(L, key) {
    lua.lua_getglobal(L, to_luastring(key));
    const value = fromLuaValue(L, -1); // Använd den generella konverteringsfunktionen
    lua.lua_pop(L, 1); // Poppa värdet från stacken
    return value;
}

// Stänger en Lua-state och frigör minne
function closeLuaState(L) {
    if (L) {
        lua.lua_close(L);
        // logger.debug om du vill logga varje stängning
    }
}

// --- Exporterar huvudfunktionerna ---
module.exports = {
    runLuaFile,
    getLuaGlobal,
    closeLuaState,
    // Du kan exportera fromLuaValue och toLuaValue om du behöver dem externt
    // fromLuaValue, 
    // toLuaValue,
};