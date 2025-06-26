const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
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
    'SELECT id, name, level FROM characters WHERE account_id = $1',
    [accountId]
  );
  return result.rows;
}

async function createCharacter(accountId, name, vocation) {
  // Validera vocation!
  const ALLOWED_VOCATIONS = ["knight", "mage", "paladin", "druid"];
  if (!ALLOWED_VOCATIONS.includes(vocation)) {
    throw new Error("Ogiltig vocation");
  }
  // Kontrollera unikt namn
  const exists = await dbPool.query(
    `SELECT 1 FROM characters WHERE name = $1`, [name]
  );
  if (exists.rows.length) throw new Error("Name is already taken!");

  // Insert
  const result = await dbPool.query(
    `INSERT INTO characters (account_id, name, vocation)
     VALUES ($1, $2, $3)
     RETURNING id, name, vocation`,
    [accountId, name, vocation]
  );
  return result.rows[0];
}

async function deleteCharacter(accountId, characterId, password) {
  // Kontrollera att lösenordet är rätt
  const accRes = await dbPool.query('SELECT password_hash FROM accounts WHERE id = $1', [accountId]);
  if (!accRes.rows.length) throw new Error("Account not found.");

  const valid = await bcrypt.compare(password, accRes.rows[0].password_hash);
  if (!valid) throw new Error("Incorrect password.");

  // Ta bort karaktären (se till att accountId äger characterId!)
  const delRes = await dbPool.query(
    'DELETE FROM characters WHERE id = $1 AND account_id = $2 RETURNING id',
    [characterId, accountId]
  );
  if (delRes.rowCount === 0) throw new Error("Character not found or not owned by account.");
  return true;
}

module.exports = {
  getCharactersForAccount,
  createCharacter,
  deleteCharacter,
};
