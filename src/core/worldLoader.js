const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require('../utils/logger');

class WorldLoader {
    constructor() {
        this.worldInfo = null;
        this.regions = new Map();
    }

    async loadAll() {
        try {
            const filePath = path.join(__dirname, '..', 'data', 'world', 'world.xml');
            const xmlData = await xmlLoader.loadXmlFile(filePath);

            if (!xmlData.world) {
                throw new Error('World data is missing in world.xml');
            }

            this.worldInfo = xmlData.world;
            logger.success(`[WORLD] World "${this.worldInfo.name}" data loaded.`);
        } catch (err) {
            logger.error(`[WORLD] Failed to load world: ${err.message}`);
            process.exit(1);
        }
    }

    async getRegion(x, y, z = 0) {
        const key = `${x}-${y}-${z}`;
        if (this.regions.has(key)) {
            return this.regions.get(key);
        }

        const filePath = path.join(__dirname, '..', 'data', 'world', 'regions', `${key}.xml`);
        
        try {
            const xmlData = await xmlLoader.loadXmlFile(filePath);
            if (!xmlData.region) {
                throw new Error(`Region file ${key}.xml is invalid.`);
            }
            this.regions.set(key, xmlData.region);
            logger.info(`[WORLD] Loaded region ${key}. Total cached: ${this.regions.size}`);
            return xmlData.region;
        } catch (err) {
            logger.error(`[WORLD] Failed to load region ${key}: ${err.message}`);
            return null;
        }
    }
    
    unloadRegion(x, y, z = 0) {
        const key = `${x}-${y}-${z}`;
        if (this.regions.has(key)) {
            this.regions.delete(key);
            logger.info(`[WORLD] Unloaded region ${key}. Total cached: ${this.regions.size}`);
        }
    }
}

module.exports = new WorldLoader();