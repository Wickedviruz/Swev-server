const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");

class ItemLoader {
    constructor() {
        this.items = new Map();
    }

    async loadAll() {
        const filePath = path.join(__dirname, '..', 'data', 'items', 'items.xml');
        const xmlData = await xmlLoader.loadXmlFile(filePath);

        if (!xmlData.items?.item) {
            // Om filen är tom eller saknar 'item' taggar, kasta ett fel
            throw new Error('No items found in items.xml');
        }

        const itemList = Array.isArray(xmlData.items.item) ? xmlData.items.item : [xmlData.items.item];
        
        itemList.forEach(item => {
            const itemId = parseInt(item.id, 10);
            
            if (isNaN(itemId)) {
                logger.warn(`Skipping invalid item entry with name: ${item.name || 'unknown'}`);
                return;
            }

            this.items.set(itemId, {
                name: item.name
                // Lägg till fler egenskaper här (t.ex. vikt, beskydd, etc.)
            });
        });
        
        // Logga framgång i loadern, precis som med OutfitLoader
        logger.success(`[ITEM] Loaded ${this.items.size} items!`);
    }

    getItem(id) {
        return this.items.get(id);
    }
}

module.exports = new ItemLoader();