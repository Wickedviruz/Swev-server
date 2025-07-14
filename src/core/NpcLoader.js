const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");

class NpcLoader {
    constructor() {
        this.npcs = new Map();
    }

    async loadAll() {
        const npcListPath = path.join(__dirname, '..', 'data', 'npc', 'npc.xml');
        const xmlData = await xmlLoader.loadXmlFile(npcListPath);

        if (!xmlData.npcs?.npc) {
            throw new Error('No NPC files listed in npcs.xml');
        }
        
        const npcFileList = Array.isArray(xmlData.npcs.npc) ? xmlData.npcs.npc : [xmlData.npcs.npc];

        for (const entry of npcFileList) {
            const filePath = path.join(__dirname, '..', 'data', 'npcs', entry.file);
            try {
                const npcXml = await xmlLoader.loadXmlFile(filePath);
                if (npcXml.npc) {
                    this.npcs.set(npcXml.npc.name, npcXml.npc);
                } else {
                    logger.warn(`NPC file ${entry.file} is missing 'npc' root element.`);
                }
            } catch (err) {
                // Denna logg är bra för att se vilken enskild fil som är trasig
                logger.error(`Failed to load NPC from file ${entry.file}: ${err.message}`);
            }
        }
        
        // Logga framgång i loadern
        logger.success(`[NPC] Loaded ${this.npcs.size} npcs!`);
    }

    getNpc(name) {
        return this.npcs.get(name);
    }
}

module.exports = new NpcLoader();