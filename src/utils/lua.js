const lua = require("lua-in-js");
const fs = require("fs");

// Skapa en ny miljö och exekvera kod
function runLuaFile(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const env = lua.createEnv();
  lua.execute(code, env);
  return env;
}

// Hämta en global variabel
function getLuaGlobal(env, key) {
  // getGlobal returnerar ett Lua-objekt, använd toPrimitive för JS-värde
  const val = env.getGlobal(key);
  if (!val) return undefined;
  if (typeof val.toPrimitive === "function") {
    return val.toPrimitive();
  }
  return val;
}

module.exports = {
  runLuaFile,
  getLuaGlobal
};