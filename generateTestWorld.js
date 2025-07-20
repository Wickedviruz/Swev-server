// generateTestWorld.js
const fs = require('fs');
const path = require('path');

const REGION_SIZE_X = 256; // BÖR matcha värdet i WorldLoader.js
const REGION_SIZE_Y = 256; // BÖR matcha värdet i WorldLoader.js
const Z_LEVEL = 7;         // Den Z-nivå vi vill skapa regioner på

// Mitten av spelarens startregion (globala koordinater)
// Baserat på att region 7-5-7 börjar vid 1792, 1280.
// Vi sätter spawn point lite in i regionen för att vara säkra på att den är inom.
const SPAWN_X = (7 * REGION_SIZE_X) + (REGION_SIZE_X / 2); // Ex: 7*256 + 128 = 1792 + 128 = 1920
const SPAWN_Y = (5 * REGION_SIZE_Y) + (REGION_SIZE_Y / 2); // Ex: 5*256 + 128 = 1280 + 128 = 1408
const SPAWN_Z = Z_LEVEL;

// Huvudkatalogen för världsdata
const WORLD_DIR = path.join(__dirname, 'src', 'data', 'world');
const REGIONS_DIR = path.join(WORLD_DIR, 'regions');

// Se till att World-katalogen existerar
if (!fs.existsSync(WORLD_DIR)) {
    fs.mkdirSync(WORLD_DIR, { recursive: true });
    console.log(`Created directory: ${WORLD_DIR}`);
}

// Se till att Regions-katalogen existerar
if (!fs.existsSync(REGIONS_DIR)) {
    fs.mkdirSync(REGIONS_DIR, { recursive: true });
    console.log(`Created directory: ${REGIONS_DIR}`);
}

// Item ID för en enkel golv-tile. Se till att detta ID finns i din itemLoader.
const DEFAULT_ITEM_ID = 106; // Ändra detta till ett giltigt ID om 100 inte finns

// --- Skapa world.xml ---
const worldXmlPath = path.join(WORLD_DIR, 'world.xml');
const worldXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<world name="Generated Test World" description="An automatically generated simple test world">
    <spawn x="${SPAWN_X}" y="${SPAWN_Y}" z="${SPAWN_Z}"/>
</world>`;

try {
    fs.writeFileSync(worldXmlPath, worldXmlContent.trim());
    console.log(`Generated: ${worldXmlPath}`);
} catch (error) {
    console.error(`Failed to write file ${worldXmlPath}:`, error);
}

// --- Skapa region-filer ---
console.log(`Generating test regions around spawn point (${SPAWN_X},${SPAWN_Y},${SPAWN_Z})...`);

// Beräkna den centrala regionen baserat på spawn-punkten
const CENTRAL_REGION_X = Math.floor(SPAWN_X / REGION_SIZE_X);
const CENTRAL_REGION_Y = Math.floor(SPAWN_Y / REGION_SIZE_Y);


for (let xOffset = -1; xOffset <= 1; xOffset++) {
    for (let yOffset = -1; yOffset <= 1; yOffset++) {
        const regionX = CENTRAL_REGION_X + xOffset;
        const regionY = CENTRAL_REGION_Y + yOffset;
        const regionKey = `${regionX}-${regionY}-${Z_LEVEL}`;
        const filePath = path.join(REGIONS_DIR, `${regionKey}.xml`);

        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<region x="${regionX}" y="${regionY}" z="${Z_LEVEL}">
    <tile x="0" y="0" z="${Z_LEVEL}">
        <item id="${DEFAULT_ITEM_ID}"/>
    </tile>
</region>`;

        try {
            fs.writeFileSync(filePath, xmlContent.trim());
            console.log(`Generated: ${filePath}`);
        } catch (error) {
            console.error(`Failed to write file ${filePath}:`, error);
        }
    }
}

console.log('Test world generation complete!');