const path = require('path');
const xmlLoader = require('../utils/xmlLoader');
const logger = require('../utils/logger');

// Konstanta för regionstorlekar (kan anpassas efter ditt spel)
// Standard för många RPG-liknande spel är 256x256 tiles per region.
const REGION_SIZE_X = 256;
const REGION_SIZE_Y = 256;
const MAX_Z_LEVELS = 16; // Max antal Z-nivåer i din värld

class WorldLoader {
    constructor() {
        this.worldInfo = null;
        // Regions lagrar laddade regiondata. Nyckeln är "x-y-z"
        // Värdet är den XML-data som returneras av xmlLoader.
        this.regions = new Map();
    }

    /**
     * Laddar huvud-världsinformationen från world.xml.
     * Denna metod anropas vid serverns uppstart.
     */
    async loadAll() {
        try {
            const filePath = path.join(__dirname, '..', 'data', 'world', 'world.xml');
            const xmlData = await xmlLoader.loadXmlFile(filePath);

            if (!xmlData.world) {
                throw new Error('World data is missing in world.xml');
            }

            this.worldInfo = xmlData.world;
            logger.success(`[WORLD] World "${this.worldInfo.name}" data loaded.`);
            // Valfritt: Pre-ladda centrala regioner här om önskas
            // t.ex. await this.getRegion(0,0,7);
        } catch (err) {
            logger.error(`[WORLD] Failed to load world: ${err.message}`);
            process.exit(1); // Fatal error, stoppa servern
        }
    }

    /**
     * Returnerar namnet på den laddade världen.
     * @returns {string|null} Världens namn.
     */
    getWorldName() {
        return this.worldInfo ? this.worldInfo.name : null;
    }

    /**
     * Hämtar en specifik region baserat på dess X, Y och Z koordinater.
     * Laddar regionen från fil om den inte redan finns i minnet.
     * @param {number} regionX - Regionens X-koordinat.
     * @param {number} regionY - Regionens Y-koordinat.
     * @param {number} regionZ - Regionens Z-koordinat (default 0).
     * @returns {Promise<object|null>} Regionens XML-data, eller null om den misslyckas.
     */
    async getRegion(regionX, regionY, regionZ = 0) {
        // Kontrollera Z-nivån för att undvika ogiltiga filvägar
        if (regionZ < 0 || regionZ >= MAX_Z_LEVELS) {
            logger.warn(`[WORLD] Attempted to load region with invalid Z-level: ${regionX}-${regionY}-${regionZ}`);
            return null;
        }

        const key = `${regionX}-${regionY}-${regionZ}`;
        if (this.regions.has(key)) {
            return this.regions.get(key);
        }

        const filePath = path.join(__dirname, '..', 'data', 'world', 'regions', `${key}.xml`);

        try {
            const xmlData = await xmlLoader.loadXmlFile(filePath);
            if (!xmlData.region) {
                throw new Error(`Region file ${key}.xml is invalid (missing <region> tag).`);
            }
            this.regions.set(key, xmlData.region);
            logger.log(`[WORLD] Loaded region ${key}. Total cached: ${this.regions.size}`);
            return xmlData.region;
        } catch (err) {
            logger.error(`[WORLD] Failed to load region ${key}: ${err.message}`);
            // Returnera null om regionen inte kan laddas.
            // Spelkoden måste hantera detta (t.ex. genom att förhindra rörelse till oladdade områden).
            return null;
        }
    }

    /**
     * Frisläpper en region från minnet.
     * Användbart för att spara minne när spelare rör sig bort från områden.
     * @param {number} regionX - Regionens X-koordinat.
     * @param {number} regionY - Regionens Y-koordinat.
     * @param {number} regionZ - Regionens Z-koordinat.
     */
    unloadRegion(regionX, regionY, regionZ = 0) {
        const key = `${regionX}-${regionY}-${regionZ}`;
        if (this.regions.has(key)) {
            this.regions.delete(key);
            logger.log(`[WORLD] Unloaded region ${key}. Total cached: ${this.regions.size}`);
        }
    }

    /**
     * Hämtar en specifik tile (ruta) från den laddade världen.
     * Denna metod är den som saknades och orsakade felet.
     * Den beräknar först vilken region tile-koordinaterna tillhör,
     * laddar regionen (om den inte redan är laddad), och hämtar sedan tile-datan.
     *
     * @param {number} x - Global X-koordinat för tile.
     * @param {number} y - Global Y-koordinat för tile.
     * @param {number} z - Z-nivå för tile.
     * @returns {Promise<object|null>} Tile-objektet, eller null om tile eller region inte hittas/laddas.
     */
    async getTile(x, y, z) {
        // Beräkna vilken region dessa globala koordinater tillhör
        const regionX = Math.floor(x / REGION_SIZE_X);
        const regionY = Math.floor(y / REGION_SIZE_Y);
        const regionZ = z; // Z-nivån är ofta direkt relaterad till regionens Z

        const regionData = await this.getRegion(regionX, regionY, regionZ);

        if (!regionData) {
            // Regionen kunde inte laddas eller hittades inte
            logger.warn(`[WORLD] getTile: Region ${regionX}-${regionY}-${regionZ} not available for tile (${x},${y},${z}).`);
            return null;
        }

        // Beräkna lokala koordinater inom regionen
        const localX = x % REGION_SIZE_X;
        const localY = y % REGION_SIZE_Y;

        // Nu, traversera regionData.
        // Antag att din region XML-struktur ser ut något så här:
        // <region>
        //   <tile x="0" y="0" z="7">...</tile>
        //   <tile x="1" y="0" z="7">...</tile>
        // </region>
        // xmlLoader omvandlar detta ofta till en array av objekt: regionData.tile

        // Observera att `regionData.tile` kan vara antingen ett enskilt objekt (om bara en tile)
        // eller en array av objekt (om flera tiles). XML-parsern kan göra detta.
        const tilesInRegion = Array.isArray(regionData.tile) ? regionData.tile : [regionData.tile];

        // Hitta rätt tile baserat på dess lokala x, y, z attribut
        const targetTile = tilesInRegion.find(tile => {
            // Kontrollera att tile och dess attribut existerar
            if (tile && tile.$) {
                // Konvertera attribut till nummer om de är strängar från XML-parsning
                return parseInt(tile.$.x) === localX &&
                       parseInt(tile.$.y) === localY &&
                       parseInt(tile.$.z) === regionZ; // Kontrollera även Z här
            }
            return false;
        });

        if (!targetTile) {
            logger.warn(`[WORLD] getTile: Tile (${x},${y},${z}) not found within loaded region ${regionX}-${regionY}-${regionZ}.`);
            return null;
        }

        return targetTile; // Returnerar den hittade tile-data (inklusive dess attribut och innehåll)
    }

    /**
     * Returnerar den globala startpositionen för spelare från world.xml.
     * @returns {object|null} Ett objekt {x, y, z} med startpositionen, eller null.
     */
    getStartSpawn() {
        if (this.worldInfo && this.worldInfo.spawn && this.worldInfo.spawn.$) {
            return {
                x: parseInt(this.worldInfo.spawn.$.x),
                y: parseInt(this.worldInfo.spawn.$.y),
                z: parseInt(this.worldInfo.spawn.$.z)
            };
        }
        logger.warn("[WORLD] No start spawn defined in world.xml or invalid format.");
        return null;
    }

    /**
     * Rensar alla laddade regioner från minnet vid serveravstängning.
     */
    cleanup() {
        this.regions.clear();
        this.worldInfo = null;
        logger.log("[WORLD] All cached regions cleared.");
    }
}

module.exports = new WorldLoader();
module.exports.REGION_SIZE_X = REGION_SIZE_X;
module.exports.REGION_SIZE_Y = REGION_SIZE_Y;
module.exports.MAX_Z_LEVELS = MAX_Z_LEVELS;