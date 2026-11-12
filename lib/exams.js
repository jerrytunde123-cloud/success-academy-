const { execute, query, queryOne } = require('./db');
const { HttpError } = require('./http');
const { DEFAULT_PRICES, DEFAULT_ALLOW } = require('./constants');

function parseJson(value, fallback) {
    try {
        const parsed = JSON.parse(value);
        return parsed === undefined || parsed === null ? fallback : parsed;
    } catch (_err) {
        return fallback;
    }
}

function normalizeSubject(subject) {
    if (typeof subject === 'string') {
        return { name: subject, content: '', thumbnail: '', qaImages: [] };
    }
    if (!subject || typeof subject !== 'object' || typeof subject.name !== 'string') {
        return null;
    }
    const qaImages = Array.isArray(subject.qaImages)
        ? subject.qaImages.filter(function (image) { return typeof image === 'string' && image; })
        : [];
    return {
        name: subject.name,
        content: typeof subject.content === 'string' ? subject.content : '',
        thumbnail: typeof subject.thumbnail === 'string' ? subject.thumbnail : '',
        qaImages: qaImages
    };
}

function parseExam(row) {
    if (!row) {
        return null;
    }
    const rawSubjects = parseJson(row.subjects, []);
    const subjects = (Array.isArray(rawSubjects) ? rawSubjects : [])
        .map(normalizeSubject)
        .filter(function (subject) { return subject && subject.name; });

    const rawPrices = parseJson(row.prices, {});
    const rawAllow = parseJson(row.allow, {});

    return {
        id: String(row.id),
        name: row.name || 'Untitled exam',
        slug: row.slug || '',
        logo: row.logo || '',
        prices: Object.assign({}, DEFAULT_PRICES, rawPrices && typeof rawPrices === 'object' ? rawPrices : {}),
        allow: Object.assign({}, DEFAULT_ALLOW, rawAllow && typeof rawAllow === 'object' ? rawAllow : {}),
        subjects: subjects,
        // Map the new tutorial columns
        tutorialPrice: row.tutorialPrice || 0,
        tutorialLink: row.tutorialLink || '',
        tutorialBenefits: row.tutorialBenefits || '',
        updatedAt: row.updatedAt || null
    };
}

function publicExam(exam) {
    return {
        id: exam.id,
        name: exam.name,
        slug: exam.slug,
        logo: exam.logo,
        prices: exam.prices,
        allow: exam.allow,
        // Send price and benefits to public site, but hide the link
        tutorialPrice: exam.tutorialPrice,
        tutorialBenefits: exam.tutorialBenefits,
        tutorialAvailable: exam.tutorialPrice > 0 && Boolean(exam.tutorialLink),
        subjects: exam.subjects.map(function (subject) {
            return { name: subject.name, thumbnail: subject.thumbnail };
        })
    };
}

async function listExams() {
    const rows = await query('SELECT * FROM exams ORDER BY CAST(id AS INTEGER), id');
    return rows.map(parseExam);
}

async function listPublicExams() {
    return (await listExams()).map(publicExam);
}

async function listAdminExams() {
    return (await listExams()).map(publicExam);
}

async function getExam(id) {
    const row = await queryOne('SELECT * FROM exams WHERE id = ?', [id]);
    return parseExam(row);
}

async function updateExamConfig(id, updates) {
    const sets = [];
    const args = [];

    if (updates.prices) {
        sets.push('prices = ?');
        args.push(JSON.stringify(updates.prices));
    }
    if (updates.allow) {
        sets.push('"allow" = ?');
        args.push(JSON.stringify(updates.allow));
    }
    
    // Handle the new tutorial fields
    if (updates.tutorialPrice !== undefined) {
        sets.push('tutorialPrice = ?');
        args.push(Number(updates.tutorialPrice) || 0);
    }
    if (updates.tutorialLink !== undefined) {
        sets.push('tutorialLink = ?');
        args.push(updates.tutorialLink || '');
    }
    if (updates.tutorialBenefits !== undefined) {
        sets.push('tutorialBenefits = ?');
        args.push(updates.tutorialBenefits || '');
    }

    if (sets.length === 0) {
        throw new HttpError(400, 'Nothing to update.');
    }

    sets.push('updatedAt = ?');
    args.push(new Date().toISOString());
    args.push(id);

    await execute('UPDATE exams SET ' + sets.join(', ') + ' WHERE id = ?', args);
    const updated = await getExam(id);
    if (!updated) {
        throw new HttpError(404, 'Exam not found.');
    }
    return updated;
}

async function updateExamSubject(examId, subjectName, data) {
    const exam = await getExam(examId);
    if (!exam) {
        throw new HttpError(404, 'Exam not found.');
    }

    const index = exam.subjects.findIndex(function (subject) {
        return subject.name === subjectName;
    });
    if (index === -1) {
        throw new HttpError(404, 'Subject not found on this exam.');
    }

    const updatedSubject = Object.assign({}, exam.subjects[index], {
        content: data.content,
        thumbnail: data.thumbnail,
        qaImages: data.qaImages
    });
    exam.subjects[index] = updatedSubject;

    await execute(
        'UPDATE exams SET subjects = ?, updatedAt = ? WHERE id = ?',
        [JSON.stringify(exam.subjects), new Date().toISOString(), examId]
    );

    return updatedSubject;
}

module.exports = {
    parseJson,
    parseExam,
    publicExam,
    listExams,
    listPublicExams,
    listAdminExams,
    getExam,
    updateExamConfig,
    updateExamSubject
};
