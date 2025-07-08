const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const fs = require('fs');

class MonsterLoader {
  constructor() {
    this.monsters = new Map();
  }

  async loadAll() {
    const monsterListPath = path.join(__dirname, '../data/monsters/monsters.xml');
    const xmlData = await xmlLoader.loadXmlFile(monsterListPath); 
    // xmlData.monsters.monster -> [{ name, file }, ...]

    if (!xmlData.monsters?.monster) throw new Error('No monsters in monsters.xml');
    for (const entry of xmlData.monsters.monster) {
      const filePath = path.join(__dirname, '../data/monsters', entry.file);
      const monsterXml = await xmlLoader.loadXmlFile(filePath); 
      this.monsters.set(entry.name, monsterXml.monster);
    }
  }
}

module.exports = new MonsterLoader();
