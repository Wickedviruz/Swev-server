const chalk = require('chalk').default || require('chalk');
const fs = require('fs');
const path = require('path');

// Sökväg till logfil
const LOG_FILE = path.join(__dirname, '..', './data/log/server.log');

// Returnerar tid i HH:mm:ss-format
function now() {
  return new Date().toLocaleTimeString('sv-SE', { hour12: false });
}

// Skriver rad till loggfilen
function writeToFile(line) {
  fs.appendFile(LOG_FILE, line + '\n', err => {
    if (err) {
      // Om filen misslyckas, visa i konsol
      console.error('[LOGGER] Failed to write to log file:', err);
    }
  });
}

function log(msg) {
  const line = `[${now()}] [INFO] ${msg}`;
  console.log(`[${now()}] ` + chalk.cyan('[INFO]') + ' ' + msg);
  writeToFile(line);
}

function success(msg) {
  const line = `[${now()}] [OK] ${msg}`;
  console.log(`[${now()}] ` + chalk.green('[OK]') + ' ' + msg);
  writeToFile(line);
}

function warn(msg) {
  const line = `[${now()}] [WARN] ${msg}`;
  console.log(`[${now()}] ` + chalk.yellow('[WARN]') + ' ' + msg);
  writeToFile(line);
}

function error(msg) {
  const line = `[${now()}] [ERROR] ${msg}`;
  console.error(`[${now()}] ` + chalk.red('[ERROR]') + ' ' + msg);
  writeToFile(line);
}

module.exports = { log, success, warn, error };
