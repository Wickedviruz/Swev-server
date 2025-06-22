const path = require("path");
const { runLuaFile, getLuaGlobal } = require("../utils/lua");

const configPath = path.join(__dirname, "..", "..", "config.lua");
const env = runLuaFile(configPath);

function get(key, fallback = undefined) {
  const val = getLuaGlobal(env, key);
  return val !== undefined ? val : fallback;
}

module.exports = { get };
