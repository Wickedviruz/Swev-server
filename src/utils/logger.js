// Använd ESM-import av chalk
const chalk = require('chalk').default || require('chalk');

// Chalk 5+ behöver anropas som funktion:
function log(msg) {
  console.log(chalk.cyan('[INFO]') + ' ' + msg);
}

function success(msg) {
  console.log(chalk.green('[OK]') + ' ' + msg);
}

function warn(msg) {
  console.log(chalk.yellow('[WARN]') + ' ' + msg);
}

function error(msg) {
  console.error(chalk.red('[ERROR]') + ' ' + msg);
}

module.exports = { log, success, warn, error };
