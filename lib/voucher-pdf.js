// Minimal, dependency-free PDF generator for result PIN vouchers.
// Kept deliberately simple: one A4 page, Helvetica, ASCII-safe text.

function escapePdfText(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/[^\x20-\x7E]/g, '?')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

function wrapText(value, maxChars) {
    const words = String(value || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    words.forEach(function (word) {
        if (word.length > maxChars) {
            if (current) {
                lines.push(current);
                current = '';
            }
            for (let index = 0; index < word.length; index += maxChars) {
                lines.push(word.slice(index, index + maxChars));
            }
            return;
        }
        if (!current) {
            current = word;
        } else if (current.length + 1 + word.length <= maxChars) {
            current += ' ' + word;
        } else {
            lines.push(current);
            current = word;
        }
    });
    if (current) {
        lines.push(current);
    }
    return lines.length > 0 ? lines : [''];
}

function buildVoucherPdf(input) {
    const entries = [];

    function add(text, options) {
        const opts = options || {};
        wrapText(text, opts.width || 78).forEach(function (line, index) {
            entries.push({
                text: line,
                size: opts.size || 11,
                bold: Boolean(opts.bold),
                gap: index === 0 ? (opts.gap || (opts.size || 11) + 7) : (opts.size || 11) + 4
            });
        });
        if (opts.space) {
            entries.push({ text: '', size: 11, bold: false, gap: opts.space });
        }
    }

    add('SUCCESS ACADEMY', { size: 20, bold: true, gap: 30 });
    add('RESULT CHECKER PIN VOUCHER', { size: 13, bold: true, gap: 26 });
    add('Order: ' + (input.reference || ''), { gap: 18 });
    add('Product: ' + (input.productName || ''), { gap: 18 });
    add('Purchased: ' + (input.date || ''), { gap: 18 });
    add('Amount paid: NGN ' + (input.amount || '0'), { gap: 18 });

    entries.push({ text: '________________________________________________', size: 11, bold: false, gap: 24 });
    add('YOUR ' + (input.serial ? 'PIN AND SERIAL' : 'TOKEN'), { size: 12, bold: true, gap: 22 });
    add(input.pin || '', { size: 22, bold: true, gap: 22 });
    if (input.serial) {
        add('Serial: ' + input.serial, { size: 14, bold: true, gap: 24 });
    }
    entries.push({ text: '________________________________________________', size: 11, bold: false, gap: 24 });

    add('HOW TO CHECK YOUR RESULT', { size: 12, bold: true, gap: 20 });
    add(input.instructions || '', { gap: 18 });
    if (input.portalUrl) {
        add('Official portal: ' + input.portalUrl, { gap: 18 });
    }
    add('One credential is for one candidate and can be used up to 5 times.', { gap: 18, size: 10 });
    add('Keep this voucher safe. Success Academy cannot retrieve a lost PIN or token.', { gap: 18, size: 10 });
    add('Need help? Contact us through the links on our website.', { gap: 18, size: 10 });

    let content = 'BT\n';
    let y = 790;
    entries.forEach(function (entry) {
        content += '/' + (entry.bold ? 'F2' : 'F1') + ' ' + entry.size + ' Tf\n';
        content += '1 0 0 1 50 ' + y + ' Tm\n';
        content += '(' + escapePdfText(entry.text) + ') Tj\n';
        y -= entry.gap;
    });
    content += 'ET\n';

    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
        '<< /Length ' + Buffer.byteLength(content, 'latin1') + ' >>\nstream\n' + content + 'endstream',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach(function (object, index) {
        offsets.push(Buffer.byteLength(pdf, 'latin1'));
        pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    });

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach(function (offset) {
        pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
    });
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
    pdf += 'startxref\n' + xrefOffset + '\n%%EOF\n';

    return Buffer.from(pdf, 'latin1');
}

module.exports = { buildVoucherPdf, wrapText };
