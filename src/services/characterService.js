const { Pool } = require('pg');
const config = require("../config/config");

const dbPool = new Pool({
  host: config.get("pg_host"),
  port: config.get("pg_port"),
  database: config.get("pg_database"),
  user: config.get("pg_user"),
  password: config.get("pg_password"),
});

async function getCharactersForAccount(accountId) {
  const result = await dbPool.query(
    'SELECT id, name, level, xp, health, healthmax, mana, manamax, maglevel FROM characters WHERE account_id = $1',
    [accountId]
  );
  return result.rows;
}

async function createCharacter(accountId, name) {
  const result = await dbPool.query(
    `INSERT INTO characters (account_id, name)
     VALUES ($1, $2)
     RETURNING id, name, level, xp, health, healthmax, mana, manamax, maglevel`,
    [accountId, name]
  );
  return result.rows[0];
}

module.exports = {
  getCharactersForAccount,
  createCharacter,
};
