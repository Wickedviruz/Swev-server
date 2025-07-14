const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");

class OutfitLoader {
    constructor() {
        this.outfits = new Map();
    }

    async loadAll() {
        const filePath = path.join(__dirname, '..', 'data', 'XML', 'outfits.xml');
        const xmlData = await xmlLoader.loadXmlFile(filePath);

        if (!xmlData.outfits?.outfit) {
            throw new Error('No outfits found in outfits.xml');
        }

        const outfitList = Array.isArray(xmlData.outfits.outfit) ? xmlData.outfits.outfit : [xmlData.outfits.outfit];
        
        outfitList.forEach(outfit => {
            const looktype = parseInt(outfit.looktype, 10);
            
            if (isNaN(looktype)) {
                logger.warn(`Skipping invalid outfit entry with name: ${outfit.name}`);
                return;
            }

            this.outfits.set(looktype, {
                name: outfit.name
                // Du kan lägga till fler egenskaper här om de finns i XML:en, t.ex.
                // premium: outfit.premium === 'yes',
            });
        });
        
        logger.success(`[OUTFIT] Loaded ${this.outfits.size} outfits!`);
    }

    getOutfit(looktype) {
        return this.outfits.get(looktype);
    }
}

module.exports = new OutfitLoader();