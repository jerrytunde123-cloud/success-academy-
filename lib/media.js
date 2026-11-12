const { query } = require('./db');
const { deleteImage } = require('./r2');

function collectUrls(value, urls) {
    try {
        const parsed = JSON.parse(value || '[]');
        if (!Array.isArray(parsed)) {
            return false;
        }
        if (Array.isArray(parsed)) {
            parsed.forEach(function (item) {
                if (typeof item === 'string') {
                    urls.add(item);
                } else if (item && typeof item === 'object') {
                    if (typeof item.thumbnail === 'string') {
                        urls.add(item.thumbnail);
                    }
                    if (Array.isArray(item.qaImages)) {
                        item.qaImages.forEach(function (url) {
                            if (typeof url === 'string') {
                                urls.add(url);
                            }
                        });
                    }
                }
            });
        }
        return true;
    } catch (_err) {
        return false;
    }
}

async function deleteUnusedImages(candidates) {
    const urls = Array.from(new Set((candidates || []).filter(function (url) {
        return typeof url === 'string' && url;
    })));
    if (urls.length === 0) {
        return '';
    }

    let exams;
    let news;
    try {
        [exams, news] = await Promise.all([
            query('SELECT subjects FROM exams'),
            query('SELECT images FROM news')
        ]);
    } catch (err) {
        console.error('[admin] Could not check image references for cleanup:', err);
        return 'The change succeeded, but old image files could not be checked for cleanup.';
    }

    const referenced = new Set();
    const safelyChecked = exams.every(function (exam) {
        return collectUrls(exam.subjects, referenced);
    }) && news.every(function (item) {
        return collectUrls(item.images, referenced);
    });
    if (!safelyChecked) {
        return 'The change succeeded, but old image files could not be checked for cleanup.';
    }

    let failed = false;
    for (const url of urls) {
        if (!referenced.has(url)) {
            try {
                await deleteImage(url);
            } catch (err) {
                console.error('[admin] Could not delete an unused R2 image:', err);
                failed = true;
            }
        }
    }
    return failed ? 'The change succeeded, but some unused image files could not be deleted from storage.' : '';
}

module.exports = { deleteUnusedImages };
