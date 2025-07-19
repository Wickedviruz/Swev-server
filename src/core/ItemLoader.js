const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");

class ItemLoader {
    constructor() {
        this.items = new Map();
    }

    async loadAll() {
        const filePath = path.join(__dirname, '..', 'data', 'items', 'items.xml');
        let xmlData;

        try {
            xmlData = await xmlLoader.loadXmlFile(filePath);
        } catch (err) {
            logger.error(`[ITEM] Failed to load items.xml: ${err.message}`);
            // It's usually better to throw here if this is a critical file for server operation.
            throw new Error('Could not load fundamental items.xml, server cannot start.');
        }

        // Ensure xmlData.items.item exists and is an array for consistent processing
        let itemList = [];
        if (xmlData.items?.item) {
            itemList = Array.isArray(xmlData.items.item) ? xmlData.items.item : [xmlData.items.item];
        } else {
            logger.warn('[ITEM] No items found in items.xml or structure is incorrect. Skipping item loading.');
            return; // No items to load, so we return early.
        }
        
        itemList.forEach(xmlItem => {
            // Extract attributes directly from the item tag first
            const itemId = parseInt(xmlItem.id, 10);
            
            if (isNaN(itemId)) {
                logger.warn(`[ITEM] Skipping invalid item entry (missing or invalid ID): ${xmlItem.name || 'unknown'}`);
                return;
            }

            const itemData = {
                id: itemId,
                name: xmlItem.name,
                article: xmlItem.article || null, // 'article' is an attribute directly on the <item> tag
            };

            // Handle nested <attribute> tags
            // `fast-xml-parser` will place child elements directly on the parent object.
            // If there are multiple <attribute> tags, it will be an array.
            // If there's only one, it will be an object.
            if (xmlItem.attribute) {
                const attributesArray = Array.isArray(xmlItem.attribute) ? xmlItem.attribute : [xmlItem.attribute];
                
                attributesArray.forEach(attr => {
                    const key = attr.key;   // 'key' is an attribute on the <attribute> tag
                    let value = attr.value; // 'value' is an attribute on the <attribute> tag

                    // Attempt to convert values to appropriate types
                    if (value === "true") {
                        value = true;
                    } else if (value === "false") {
                        value = false;
                    } else if (!isNaN(parseFloat(value)) && isFinite(value)) {
                        value = parseFloat(value); // Convert numbers
                    }
                    
                    // Add the attribute directly to the itemData object
                    itemData[key] = value;
                });
            }
            
            this.items.set(itemId, itemData);
        });
        
        logger.success(`[ITEM] Loaded ${this.items.size} items!`);
    }

    getItem(id) {
        return this.items.get(id);
    }
}

module.exports = new ItemLoader();