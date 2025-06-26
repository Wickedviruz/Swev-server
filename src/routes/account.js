const express = require('express');
const accountService = require('../services/accountService');
const router = express.Router();

// REGISTER
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Användarnamn och lösenord krävs." });
  }
  try {
    // Kolla om user finns
    const exists = await accountService.findByUsername(username);
    if (exists) return res.status(400).json({ error: "Användarnamnet är upptaget." });

    const user = await accountService.register(username, email, password);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Användarnamn och lösenord krävs." });
  }
  try {
    const user = await accountService.validatePassword(username, password);
    if (!user) return res.status(401).json({ error: "Felaktigt användarnamn eller lösenord." });

    // Du kan här skapa en JWT eller sessions-token – vi returnerar basic user-info nu:
    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/', async (req, res) => {
  const { accountId, password } = req.body;
  if (!accountId || !password) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    await accountService.deleteAccount(accountId, password);
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

module.exports = router;
