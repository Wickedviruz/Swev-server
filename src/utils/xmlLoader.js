const fs = require('fs/promises');
const { XMLParser } = require('fast-xml-parser');

async function loadXmlFile(path) {
  try {
    const xml = await fs.readFile(path, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "", // gör att <foo bar="baz"/> blir { foo: { bar: "baz" } }
    });
    const result = parser.parse(xml);
    return result;
  } catch (err) {
    throw new Error(`Could not load XML ${path}: ${err.message}`);
  }
}

module.exports = { loadXmlFile };
