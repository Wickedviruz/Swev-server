const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');

// Hämta alla karaktärer för ett konto
router.get('/:accountId', async (req, res) => {
  try {
    const characters = await characterService.getCharactersForAccount(req.params.accountId);
    res.json({ characters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Skapa ny karaktär
router.post('/', async (req, res) => {
  try {
    const { accountId, name, vocation } = req.body;
    if (!accountId || !name || !vocation) {
      return res.status(400).json({ error: "accountId, name och vocation is needed!" });
    }
    const character = await characterService.createCharacter(accountId, name, vocation);
    res.json({ success: true, character });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete karaktär
router.delete('/:characterId', async (req, res) => {
  const { accountId, password } = req.body;
  const { characterId } = req.params;
  if (!accountId || !characterId || !password) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    await characterService.deleteCharacter(accountId, characterId, password);
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

module.exports = router;
