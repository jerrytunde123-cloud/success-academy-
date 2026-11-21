// Result-checker products (WAEC / NECO) and their admin-editable pricing.

const { execute, query, queryOne } = require('./db');
const { HttpError } = require('./http');
const { text } = require('./validate');

function parseProduct(row) {
    if (!row) {
        return null;
    }
    return {
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        logo: row.logo || '',
        price: Number(row.priceKobo) / 100,
        priceKobo: Number(row.priceKobo),
        cost: Number(row.costKobo) / 100,
        costKobo: Number(row.costKobo),
        serialRequired: Number(row.serialRequired) === 1,
        portalUrl: row.portalUrl || '',
        instructions: row.instructions || '',
        active: Number(row.active) === 1,
        available: Number(row.available || 0),
        sold: Number(row.sold || 0),
        updatedAt: row.updatedAt || null
    };
}

const PRODUCT_QUERY = `
    SELECT p.*,
        (SELECT COUNT(*) FROM result_pins rp WHERE rp.productId = p.id AND rp.status = 'available') AS available,
        (SELECT COUNT(*) FROM result_pins rp WHERE rp.productId = p.id AND rp.status = 'sold') AS sold
    FROM result_products p
`;

async function listProducts(options) {
    const opts = options || {};
    const where = opts.includeActiveOnly ? ' WHERE p.active = 1' : '';
    const rows = await query(PRODUCT_QUERY + where + ' ORDER BY p.id ASC');
    return rows.map(parseProduct);
}

async function getProduct(id, options) {
    const opts = options || {};
    const where = opts.availableOnly
        ? ' WHERE p.id = ? AND p.active = 1'
        : ' WHERE p.id = ?';
    const rows = await query(PRODUCT_QUERY + where, [id]);
    return parseProduct(rows[0] || null);
}

function parsePrice(value, field) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 10000000) {
        throw new HttpError(400, field + ' must be a whole number of naira between 0 and 10,000,000.');
    }
    return number;
}

function normalizeProductUpdate(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'Product data must be an object.');
    }
    const result = {
        id: text(payload.id, 'id', { required: true, max: 64 }),
        price: parsePrice(payload.price, 'price'),
        cost: parsePrice(payload.cost, 'cost'),
        portalUrl: text(payload.portalUrl, 'portalUrl', { max: 2048, defaultValue: '' }),
        instructions: text(payload.instructions, 'instructions', { max: 5000, defaultValue: '' }),
        active: payload.active === true || payload.active === 1 || payload.active === '1'
    };
    if (result.portalUrl && !/^https?:\/\//i.test(result.portalUrl)) {
        throw new HttpError(400, 'portalUrl must be an http(s) URL.');
    }
    return result;
}

async function updateProduct(input) {
    const product = await getProduct(input.id);
    if (!product) {
        throw new HttpError(404, 'Result product not found.');
    }
    await execute(
        'UPDATE result_products SET priceKobo = ?, costKobo = ?, portalUrl = ?, instructions = ?, active = ?, updatedAt = ? WHERE id = ?',
        [
            input.price * 100,
            input.cost * 100,
            input.portalUrl,
            input.instructions,
            input.active ? 1 : 0,
            new Date().toISOString(),
            input.id
        ]
    );
    return getProduct(input.id);
}

async function productExists(id) {
    const row = await queryOne('SELECT id FROM result_products WHERE id = ?', [id]);
    return Boolean(row);
}

module.exports = {
    parseProduct,
    listProducts,
    getProduct,
    normalizeProductUpdate,
    updateProduct,
    productExists
};
