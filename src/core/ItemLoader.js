const path = require('path');
const { loadXmlFile } = require('../utils/xmlLoader');

class ItemLoader {
  constructor() {
    this.items = new Map();
  }

  async loadAll() {
    const itemFile = path.join(__dirname, '../data/items/items.xml');
    const xmlData = await loadXmlFile(itemFile);

    if (!xmlData.items?.item) throw new Error('No items in items.xml');
    const itemArray = Array.isArray(xmlData.items.item)
      ? xmlData.items.item
      : [xmlData.items.item];

    for (const item of itemArray) {
      const id = parseInt(item.id, 10);
      const name = item.name;
      const article = item.article;
      let attributes = {};
      if (item.attribute) {
        const attrs = Array.isArray(item.attribute)
          ? item.attribute
          : [item.attribute];
        for (const attr of attrs) {
          attributes[attr.key] = attr.value;
        }
      }
      this.items.set(id, {
        id,
        name,
        article,
        attributes,
      });
    }
  }
}

module.exports = new ItemLoader();
