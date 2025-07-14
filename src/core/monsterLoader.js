const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");

class MonsterLoader {
    constructor() {
        this.monsters = new Map();
    }

    async loadAll() {
        const monsterListPath = path.join(__dirname, '..', 'data', 'monsters', 'monsters.xml');
        const xmlData = await xmlLoader.loadXmlFile(monsterListPath);

        if (!xmlData.monsters?.monster) {
            throw new Error('No monsters found in monsters.xml');
        }

        const monsterFileList = Array.isArray(xmlData.monsters.monster) ? xmlData.monsters.monster : [xmlData.monsters.monster];
        
        for (const entry of monsterFileList) {
            const filePath = path.join(__dirname, '..', 'data', 'monsters', entry.file);
            try {
                const monsterXml = await xmlLoader.loadXmlFile(filePath);
                if (monsterXml.monster) {
                    this.monsters.set(entry.name, monsterXml.monster);
                } else {
                    logger.warn(`Monster file ${entry.file} is missing 'monster' root element.`);
                }
            } catch (err) {
                // Denna logg är bra för att se vilken enskild fil som är trasig
                logger.error(`Failed to load monster from file ${entry.file}: ${err.message}`);
            }
        }
        
        // Logga framgång i loadern
        logger.success(`[MONSTER] Loaded ${this.monsters.size} monsters!`);
    }

    getMonster(name) {
        return this.monsters.get(name);
    }
}

module.exports = new MonsterLoader();