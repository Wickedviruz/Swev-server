const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require("../utils/logger");

// Helper function to convert string values to numbers or booleans where appropriate
function parseAttributeValue(value) {
    if (typeof value !== 'string') return value; // Already processed or not a string

    if (value === "true") return true;
    if (value === "false") return false;

    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num)) {
        return num;
    }
    return value; // Return as string if not convertible
}

// Function to process an object's properties and convert values
function deepParseAttributes(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return parseAttributeValue(obj);
    }

    const newObj = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = deepParseAttributes(obj[key]);
        }
    }
    return newObj;
}

class MonsterLoader {
    constructor() {
        this.monsters = new Map();
    }

    async loadAll() {
        const monsterListPath = path.join(__dirname, '..', 'data', 'monsters', 'monsters.xml');
        let xmlData;

        try {
            xmlData = await xmlLoader.loadXmlFile(monsterListPath);
        } catch (err) {
            logger.error(`[MONSTER] Failed to load monsters.xml: ${err.message}`);
            throw new Error('Could not load fundamental monsters.xml, server cannot start.');
        }

        let monsterFileList = [];
        if (xmlData.monsters?.monster) {
            monsterFileList = Array.isArray(xmlData.monsters.monster) ? xmlData.monsters.monster : [xmlData.monsters.monster];
        } else {
            logger.warn('[MONSTER] No monsters found in monsters.xml or structure is incorrect. Skipping monster loading.');
            return;
        }
        
        for (const entry of monsterFileList) {
            if (!entry.file || !entry.name) {
                logger.warn('[MONSTER] Monster entry in monsters.xml is missing "file" or "name" attribute.');
                continue;
            }

            const filePath = path.join(__dirname, '..', 'data', 'monsters', entry.file);
            try {
                const monsterXmlData = await xmlLoader.loadXmlFile(filePath);
                if (monsterXmlData.monster) {
                    const rawMonster = monsterXmlData.monster;
                    const processedMonster = {};

                    // --- Process direct attributes of <monster> tag ---
                    // These are already handled well by fast-xml-parser
                    processedMonster.name = rawMonster.name;
                    processedMonster.nameDescription = rawMonster.nameDescription || null;
                    processedMonster.race = rawMonster.race || null;
                    processedMonster.experience = parseAttributeValue(rawMonster.experience);
                    processedMonster.speed = parseAttributeValue(rawMonster.speed);
                    processedMonster.manacost = parseAttributeValue(rawMonster.manacost);
                    processedMonster.raceId = parseAttributeValue(rawMonster.raceId);

                    // --- Process <health> ---
                    if (rawMonster.health) {
                        processedMonster.health = {
                            now: parseAttributeValue(rawMonster.health.now),
                            max: parseAttributeValue(rawMonster.health.max)
                        };
                    }

                    // --- Process <look> ---
                    if (rawMonster.look) {
                        processedMonster.look = {
                            type: parseAttributeValue(rawMonster.look.type),
                            corpse: parseAttributeValue(rawMonster.look.corpse)
                        };
                    }

                    // --- Process <targetchange> ---
                    if (rawMonster.targetchange) {
                        processedMonster.targetchange = {
                            interval: parseAttributeValue(rawMonster.targetchange.interval),
                            chance: parseAttributeValue(rawMonster.targetchange.chance)
                        };
                    }

                    // --- Process <flags> ---
                    processedMonster.flags = {};
                    if (rawMonster.flags && rawMonster.flags.flag) {
                        // Ensure flags is an array
                        const flagsArray = Array.isArray(rawMonster.flags.flag) ? rawMonster.flags.flag : [rawMonster.flags.flag];
                        flagsArray.forEach(flagObj => {
                            // Each flag object has a single key:value pair (e.g., { "summonable": "1" })
                            const flagName = Object.keys(flagObj)[0];
                            if (flagName) {
                                processedMonster.flags[flagName] = parseAttributeValue(flagObj[flagName]);
                            }
                        });
                    }

                    // --- Process <bestiary> ---
                    if (rawMonster.bestiary) {
                        processedMonster.bestiary = {
                            class: rawMonster.bestiary.class || null,
                            prowess: parseAttributeValue(rawMonster.bestiary.prowess),
                            expertise: parseAttributeValue(rawMonster.bestiary.expertise),
                            mastery: parseAttributeValue(rawMonster.bestiary.mastery),
                            charmPoints: parseAttributeValue(rawMonster.bestiary.charmPoints),
                            difficulty: rawMonster.bestiary.difficulty || null,
                            occurrence: rawMonster.bestiary.occurrence || null,
                            locations: rawMonster.bestiary.locations || null
                        };
                    }

                    // --- Process <attacks> ---
                    processedMonster.attacks = [];
                    if (rawMonster.attacks && rawMonster.attacks.attack) {
                        const attacksArray = Array.isArray(rawMonster.attacks.attack) ? rawMonster.attacks.attack : [rawMonster.attacks.attack];
                        attacksArray.forEach(attack => {
                            processedMonster.attacks.push({
                                name: attack.name || null,
                                interval: parseAttributeValue(attack.interval),
                                min: parseAttributeValue(attack.min),
                                max: parseAttributeValue(attack.max)
                                // Add other attack attributes if they appear (e.g., "skill", "mana")
                            });
                        });
                    }

                    // --- Process <defenses> ---
                    if (rawMonster.defenses) {
                        processedMonster.defenses = {
                            armor: parseAttributeValue(rawMonster.defenses.armor),
                            defense: parseAttributeValue(rawMonster.defenses.defense)
                        };
                    }

                    // --- Process <elements> ---
                    processedMonster.elements = {};
                    if (rawMonster.elements && rawMonster.elements.element) {
                        // 'element' can be an object or an array of objects
                        const elementsArray = Array.isArray(rawMonster.elements.element) ? rawMonster.elements.element : [rawMonster.elements.element];
                        elementsArray.forEach(elementObj => {
                            // Each element object has keys like earthPercent, holyPercent etc.
                            // We can merge these directly into the elements object
                            for (const key in elementObj) {
                                if (Object.prototype.hasOwnProperty.call(elementObj, key)) {
                                    processedMonster.elements[key] = parseAttributeValue(elementObj[key]);
                                }
                            }
                        });
                    }

                    // --- Process <voices> ---
                    processedMonster.voices = {
                        interval: parseAttributeValue(rawMonster.voices?.interval),
                        chance: parseAttributeValue(rawMonster.voices?.chance),
                        sentences: []
                    };
                    if (rawMonster.voices && rawMonster.voices.voice) {
                        const voicesArray = Array.isArray(rawMonster.voices.voice) ? rawMonster.voices.voice : [rawMonster.voices.voice];
                        voicesArray.forEach(voice => {
                            if (voice.sentence) {
                                processedMonster.voices.sentences.push(voice.sentence);
                            }
                        });
                    }
                    
                    // --- Process <loot> ---
                    processedMonster.loot = [];
                    if (rawMonster.loot && rawMonster.loot.item) {
                        const lootItemsArray = Array.isArray(rawMonster.loot.item) ? rawMonster.loot.item : [rawMonster.loot.item];
                        lootItemsArray.forEach(lootItem => {
                            processedMonster.loot.push({
                                name: lootItem.name || null,
                                id: parseAttributeValue(lootItem.id), // Item ID from loot
                                countmax: parseAttributeValue(lootItem.countmax),
                                chance: parseAttributeValue(lootItem.chance)
                                // Add other loot attributes if they appear (e.g., "countmin")
                            });
                        });
                    }

                    this.monsters.set(entry.name, processedMonster);
                } else {
                    logger.warn(`[MONSTER] Monster file ${entry.file} is missing 'monster' root element.`);
                }
            } catch (err) {
                logger.error(`[MONSTER] Failed to load monster from file ${entry.file}: ${err.message}`);
            }
        }
        
        logger.success(`[MONSTER] Loaded ${this.monsters.size} monsters!`);
    }

    getMonster(name) {
        return this.monsters.get(name);
    }
}

module.exports = new MonsterLoader();