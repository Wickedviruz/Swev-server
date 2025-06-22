const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const fs = require("fs");

function runLuaFile(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  // Ladda och kör koden
  if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK) {
    throw new Error("Lua syntax error");
  }
  if (lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
    const msg = to_jsstring(lua.lua_tojsstring(L, -1));
    throw new Error("Lua runtime error: " + msg);
  }
  return L;
}

function getLuaGlobal(L, key) {
  lua.lua_getglobal(L, to_luastring(key));
  let value;
  switch (lua.lua_type(L, -1)) {
    case lua.LUA_TSTRING:
      value = to_jsstring(lua.lua_tostring(L, -1));
      break;
    case lua.LUA_TNUMBER:
      value = lua.lua_tonumber(L, -1);
      break;
    case lua.LUA_TBOOLEAN:
      value = !!lua.lua_toboolean(L, -1);
      break;
    default:
      value = undefined;
  }
  lua.lua_pop(L, 1);
  return value;
}

module.exports = { runLuaFile, getLuaGlobal };
