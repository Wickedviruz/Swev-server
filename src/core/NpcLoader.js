// core/NpcLoader.js
const path = require('path');
const { loadXmlFile } = require('../utils/xmlLoader');

class NpcLoader {
  constructor() {
    this.npcs = new Map();
  }

  async loadAll() {
    const npcListPath = path.join(__dirname, '../data/npc/npc.xml');
    const xmlData = await loadXmlFile(npcListPath);

    if (!xmlData.npcs?.npc) throw new Error('No npcs in npc.xml');
    const npcArray = Array.isArray(xmlData.npcs.npc) ? xmlData.npcs.npc : [xmlData.npcs.npc];

    for (const entry of npcArray) {
      const filePath = path.join(__dirname, '../data/npc', entry.file);
      const npcXml = await loadXmlFile(filePath);

      // Spara script-filen (lua eller js) om den finns
      let scriptFile = npcXml.npc?.script;
      this.npcs.set(entry.name, {
        ...npcXml.npc,
        script: scriptFile,
      });
    }
  }
}

module.exports = new NpcLoader();
