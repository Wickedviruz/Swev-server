const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const config = require('../config/config');
const dbPool = new Pool({
  host: config.get("pg_host"),
  port: config.get("pg_port"),
  database: config.get("pg_database"),
  user: config.get("pg_user"),
  password: config.get("pg_password"),
});

const SALT_ROUNDS = 12;

async function register(username, email, password) {
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await dbPool.query(
    'INSERT INTO accounts (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
    [username, email, password_hash]
  );
  return result.rows[0];
}

async function findByUsername(username) {
  const result = await dbPool.query(
    'SELECT * FROM accounts WHERE username = $1',
    [username]
  );
  return result.rows[0];
}

async function validatePassword(username, password) {
  const user = await findByUsername(username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.password_hash);
  return match ? user : null;
}

module.exports = {
  register,
  findByUsername,
  validatePassword,
};
