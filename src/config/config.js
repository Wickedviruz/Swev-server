const { runLuaFile, getLuaGlobal } = require("../utils/lua");
const L = runLuaFile("config.lua");

function get(key, fallback) {
  const val = getLuaGlobal(L, key);
  return typeof val !== "undefined" ? val : fallback;
}

module.exports = { get };
