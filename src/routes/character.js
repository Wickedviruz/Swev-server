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
    const { accountId, name } = req.body;
    const character = await characterService.createCharacter(accountId, name);
    res.json({ success: true, character });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
