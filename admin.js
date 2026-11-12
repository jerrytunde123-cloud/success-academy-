// Success Academy — admin dashboard logic.
const API_URL = '/api';
const MAX_UPLOAD_MB = 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

var exams = [];
var activeExam = null;
var activeSubject = null;
var allNews = [];
var allEnquiries = [];
var currentReplyData = null;
var editingNewsImages = [];
var currentDeleteResolve = null;
var currentDeleteRequiresPhrase = false;

function $(id) { return document.getElementById(id); }

/* eslint-disable-next-line no-unused-vars */
async function withButtonLoading(button, loadingText, action) {
    if (!button || button.disabled) {
        return;
    }
    var originalContent = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = loadingText;
    try {
        return await action();
    } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (button.textContent === loadingText) {
            button.innerHTML = originalContent;
        }
    }
}

function confirmDeletion(title, description, requirePhrase) {
    if (currentDeleteResolve) {
        currentDeleteResolve(false);
    }
    currentDeleteRequiresPhrase = Boolean(requirePhrase);
    setText('delete-title', title);
    setText('delete-description', description);
    $('delete-phrase-area').style.display = currentDeleteRequiresPhrase ? 'block' : 'none';
    $('delete-phrase').value = '';
    $('confirm-delete').disabled = currentDeleteRequiresPhrase;
    $('delete-modal').style.display = 'flex';
    if (currentDeleteRequiresPhrase) {
        $('delete-phrase').focus();
    } else {
        $('cancel-delete').focus();
    }

    return new Promise(function (resolve) {
        currentDeleteResolve = resolve;
    });
}

function finishDeletion(confirmed) {
    if (!currentDeleteResolve) {
        return;
    }
    if (confirmed && currentDeleteRequiresPhrase && $('delete-phrase').value !== 'DELETE') {
        return;
    }
    var resolve = currentDeleteResolve;
    currentDeleteResolve = null;
    currentDeleteRequiresPhrase = false;
    $('delete-modal').style.display = 'none';
    $('delete-phrase').value = '';
    $('confirm-delete').disabled = false;
    resolve(confirmed);
}

$('delete-phrase').addEventListener('input', function () {
    $('confirm-delete').disabled = currentDeleteRequiresPhrase && $('delete-phrase').value !== 'DELETE';
});
$('cancel-delete').addEventListener('click', function () { finishDeletion(false); });
$('confirm-delete').addEventListener('click', function () { finishDeletion(true); });
$('delete-modal').addEventListener('click', function (event) {
    if (event.target === $('delete-modal')) {
        finishDeletion(false);
    }
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        finishDeletion(false);
    }
});

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(path, options) {
    var opts = options || {};
    var config = { method: opts.method || 'GET', cache: 'no-store', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { config.headers['Content-Type'] = 'application/json'; config.body = JSON.stringify(opts.body); }
    var response = await fetch(API_URL + path, config);
    var data = {};
    try { data = await response.json(); } catch (_err) { data = {}; }
    if (!response.ok) {
        if (response.status === 401) { showLoginScreen(); }
        var error = new Error(data.error || 'Request failed. Please try again.');
        error.status = response.status;
        throw error;
    }
    return data;
}

function showLoginScreen() {
    $('login-screen').style.display = 'block';
    $('dashboard').style.display = 'none';
    $('login-error').style.display = 'none';
    $('admin-password').value = '';
}

function showDashboard() {
    $('login-screen').style.display = 'none';
    $('dashboard').style.display = 'block';
}

function setText(id, value) { var el = $(id); if (el) {el.innerText = value;} }

function showCleanupWarning(result) {
    if (result && result.warning) {
        alert(result.warning);
    }
}

window.checkPassword = async function () {
    var password = $('admin-password').value;
    var errorEl = $('login-error');
    var button = document.querySelector('#login-screen .save-btn');
    if (!password) { errorEl.innerText = 'Enter your admin password.'; errorEl.style.display = 'block'; return; }
    errorEl.style.display = 'none';
    button.disabled = true; button.setAttribute('aria-busy', 'true'); button.innerText = 'Logging in...';
    try {
        await api('/admin/login', { method: 'POST', body: { password: password } });
        showDashboard();
        await initDashboard();
    } catch (err) {
        errorEl.innerText = err.message || 'Incorrect Password!';
        errorEl.style.display = 'block';
    } finally {
        button.disabled = false; button.removeAttribute('aria-busy'); button.innerText = 'Login';
    }
};

window.logout = async function () {
    try {
        await api('/admin/logout', { method: 'POST' });
    } catch (_err) {
        // The local session is discarded even if the server session already expired.
    }
    activeExam = null; activeSubject = null; exams = [];
    showLoginScreen();
};

window.switchTab = async function (tabId, event) {
    document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.remove('active'); });
    document.querySelectorAll('.section').forEach(function (section) { section.classList.remove('active'); });
    if (event && event.target) {event.target.classList.add('active');}
    var target = $('tab-' + tabId);
    if (target) {
        target.classList.add('active');
    }

    if (tabId === 'enquiries') { await loadEnquiries(); }
    if (tabId === 'pins') { await loadPinHistory(); }
    if (tabId === 'orders') { await loadOrders(); }
    if (tabId === 'news') { await loadNews(); }
};

async function initDashboard() {
    await initDashboardStats();

    var select = $('exam-select');
    select.innerHTML = '<option value="">-- Select Exam --</option>';
    try {
        exams = await api('/admin/exams');
        exams.forEach(function (exam) { select.innerHTML += '<option value="' + escapeHtml(exam.id) + '">' + escapeHtml(exam.name) + '</option>'; });
        var manualSelect = $('manual-exam-select');
        manualSelect.innerHTML = '';
        exams.forEach(function (exam) { manualSelect.innerHTML += '<option value="' + escapeHtml(exam.id) + '">' + escapeHtml(exam.name) + '</option>'; });
        window.loadManualSubjects();
    } catch (err) { select.innerHTML = '<option value="">-- Could not load exams --</option>'; alert(err.message); }
}

async function initDashboardStats() {
    try {
        var stats = await api('/admin/stats');
        setText('stat-today', stats.todayVisitors);
        setText('stat-total', stats.totalVisitors);
        setText('stat-pins', stats.totalPinsSold);
        setText('stats-error', '');
    } catch (err) {
        setText('stat-today', 'N/A');
        setText('stat-total', 'N/A');
        setText('stat-pins', 'N/A');
        setText('stats-error', 'Statistics could not be loaded: ' + err.message);
    }
}

window.loadExamConfig = async function () {
    var id = $('exam-select').value;
    if (!id) { $('config-area').style.display = 'none'; $('content-area').style.display = 'none'; return; }
    try { activeExam = await api('/admin/exams?id=' + encodeURIComponent(id)); } catch (err) { alert(err.message); return; }
    activeSubject = null;
    $('config-area').style.display = 'block';
    $('content-area').style.display = 'block';
    setText('config-name', activeExam.name);
    $('price-per-subject').value = activeExam.prices.per_subject;
    $('allow-per-subject').checked = activeExam.allow.per_subject;
    $('price-per-dept').value = activeExam.prices.per_dept;
    $('allow-per-dept').checked = activeExam.allow.per_dept;
    $('price-all-subjects').value = activeExam.prices.all_subjects;
    $('allow-all').checked = activeExam.allow.all_subjects;
    
    // ⚠️ LOAD TUTORIAL FIELDS
    $('tutorial-price').value = activeExam.tutorialPrice || 0;
    $('tutorial-link').value = activeExam.tutorialLink || '';
    $('tutorial-benefits').value = activeExam.tutorialBenefits || '';

    var subSelect = $('subject-select');
    subSelect.innerHTML = '';
    activeExam.subjects.forEach(function (sub) { subSelect.innerHTML += '<option value="' + escapeHtml(sub.name) + '">' + escapeHtml(sub.name) + '</option>'; });
    if (activeExam.subjects.length > 0) {window.loadSubjectData();}
};

window.loadSubjectData = function () {
    if (!activeExam) {return;}
    var subName = $('subject-select').value;
    activeSubject = activeExam.subjects.find(function (subject) { return subject.name === subName; });
    if (!activeSubject) {return;}
    $('content-input').value = activeSubject.content || '';
    var thumbPreview = $('thumbnail-preview');
    if (activeSubject.thumbnail) {
        thumbPreview.innerHTML = '<img src="' + escapeHtml(activeSubject.thumbnail) + '" alt="Thumbnail" style="width:100px; height:100px; object-fit:cover; border-radius:5px;"> <button type="button" class="danger-btn" onclick="withButtonLoading(this, \'Deleting...\', removeThumbnail)">Delete thumbnail</button>';
    } else {
        thumbPreview.innerHTML = '<p style="font-size:12px; color:#666;">No thumbnail.</p>';
    }

    var gallery = $('qa-gallery');
    gallery.innerHTML = '';
    var images = Array.isArray(activeSubject.qaImages) ? activeSubject.qaImages : [];
    if (images.length === 0) {
        gallery.innerHTML = '<p style="font-size:12px; color:#666;">No Q&A images.</p>';
    } else {
        images.forEach(function (imgUrl, index) {
            gallery.innerHTML += '<div class="image-thumbnail"><img src="' + escapeHtml(imgUrl) + '" alt="Q&A image"><button class="delete-img-btn" type="button" aria-label="Delete Q&A image ' + (index + 1) + '" onclick="withButtonLoading(this, \'Deleting...\', () => removeQAImage(' + index + '))">&times;</button></div>';
        });
    }
};

async function saveActiveSubjectToDB(subject) {
    var target = subject || activeSubject;
    if (!activeExam || !target) {
        return;
    }

    return api(
        '/admin/subjects?examId=' + encodeURIComponent(activeExam.id) + '&name=' + encodeURIComponent(target.name),
        {
            method: 'PUT',
            body: {
                content: target.content,
                thumbnail: target.thumbnail,
                qaImages: target.qaImages
            }
        }
    );
}

window.removeQAImage = async function (index) {
    if (!activeSubject) {
        return;
    }

    var imageUrl = activeSubject.qaImages[index];
    if (!imageUrl || !await confirmDeletion(
        'Are you sure you want to delete this Q&A image?',
        'This permanently removes the image from this subject. If no other content uses it, its stored file will also be deleted.'
    )) {
        return;
    }

    var updatedSubject = Object.assign({}, activeSubject, {
        qaImages: activeSubject.qaImages.filter(function (_url, imageIndex) {
            return imageIndex !== index;
        })
    });
    try {
        var result = await saveActiveSubjectToDB(updatedSubject);
        activeSubject.qaImages = updatedSubject.qaImages;
        window.loadSubjectData();
        showCleanupWarning(result);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
};

window.removeThumbnail = async function () {
    if (!activeSubject || !activeSubject.thumbnail) {
        return;
    }
    if (!await confirmDeletion(
        'Are you sure you want to delete this thumbnail?',
        'The thumbnail will be removed from the public subject page. If no other content uses it, its stored file will also be deleted.'
    )) {
        return;
    }
    var updatedSubject = Object.assign({}, activeSubject, { thumbnail: '' });
    try {
        var result = await saveActiveSubjectToDB(updatedSubject);
        activeSubject.thumbnail = '';
        window.loadSubjectData();
        showCleanupWarning(result);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
};

window.saveConfig = async function () {
    if (!activeExam) {return;}
    var prices = { per_subject: Number($('price-per-subject').value), per_dept: Number($('price-per-dept').value), all_subjects: Number($('price-all-subjects').value) };
    var allow = { per_subject: $('allow-per-subject').checked, per_dept: $('allow-per-dept').checked, all_subjects: $('allow-all').checked };
    
    var tutorialData = {
        tutorialPrice: Number($('tutorial-price').value),
        tutorialLink: $('tutorial-link').value.trim(),
        tutorialBenefits: $('tutorial-benefits').value.trim()
    };

    try {
        var result = await api('/admin/exams', { method: 'PUT', body: { id: activeExam.id, prices: prices, allow: allow, ...tutorialData } });
        activeExam = result.exam;
        alert('Prices Updated!');
    } catch (err) { alert('Failed to save: ' + err.message); }
};

async function uploadFileToR2(file) {
    if (!file) {
        throw new Error('Select an image first.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('Images must be smaller than ' + MAX_UPLOAD_MB + ' MB (this file is ' +
            (file.size / 1024 / 1024).toFixed(1) + ' MB).');
    }

    var contentType = file.type || 'image/jpeg';
    var response = await fetch(API_URL + '/admin/upload', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Type': contentType,
            'X-File-Name': file.name || 'upload'
        },
        body: file
    });

    var data = {};
    try {
        data = await response.json();
    } catch (_err) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.error || 'The image could not be uploaded. Please try again.');
    }

    return data.publicUrl;
}

window.uploadThumbnail = async function () {
    var fileInput = $('thumbnail-upload');
    if (!fileInput.files || fileInput.files.length === 0) {
        return alert('Select an image first.');
    }
    if (!activeSubject) {
        return alert('Select a subject first.');
    }

    try {
        var imageUrl = await uploadFileToR2(fileInput.files[0]);
        var updatedSubject = Object.assign({}, activeSubject, { thumbnail: imageUrl });
        var result = await saveActiveSubjectToDB(updatedSubject);
        activeSubject.thumbnail = imageUrl;
        showCleanupWarning(result);
        alert('Thumbnail Uploaded!');
        fileInput.value = '';
        window.loadSubjectData();
    } catch (err) {
        alert('Failed: ' + err.message);
    }
};

window.uploadQAImages = async function () {
    var fileInput = $('qa-upload');
    if (!fileInput.files || fileInput.files.length === 0) {
        return alert('Select images first.');
    }
    if (!activeSubject) {
        return alert('Select a subject first.');
    }

    var currentQA = Array.isArray(activeSubject.qaImages) ? activeSubject.qaImages : [];
    if (currentQA.length + fileInput.files.length > 25) {
        return alert('Max 25 images.');
    }
    if (fileInput.files.length > 5) {
        return alert('Upload at most 5 images at once.');
    }

    try {
        var newUrls = [];
        for (var index = 0; index < fileInput.files.length; index++) {
            newUrls.push(await uploadFileToR2(fileInput.files[index]));
        }
        var updatedSubject = Object.assign({}, activeSubject, { qaImages: currentQA.concat(newUrls) });
        await saveActiveSubjectToDB(updatedSubject);
        activeSubject.qaImages = updatedSubject.qaImages;
        alert('Q&A Images Uploaded!');
        fileInput.value = '';
        window.loadSubjectData();
    } catch (err) {
        alert('Failed: ' + err.message);
    }
};

window.saveTextContent = async function () {
    if (!activeSubject) {
        return alert('Select a subject first.');
    }

    var updatedSubject = Object.assign({}, activeSubject, { content: $('content-input').value });
    try {
        await saveActiveSubjectToDB(updatedSubject);
        activeSubject.content = updatedSubject.content;
        alert('Text Answers Saved!');
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
};

window.loadManualSubjects = function () {
    var examId = $('manual-exam-select').value;
    var exam = exams.find(function (item) { return item.id === examId; });
    var area = $('manual-subjects-area');
    area.innerHTML = '';

    if (!exam) {
        return;
    }

    exam.subjects.forEach(function (sub) {
        area.innerHTML += '<label style="display:block; margin-bottom:5px;"><input type="checkbox" name="manual-sub" value="' + escapeHtml(sub.name) + '"> ' + escapeHtml(sub.name) + '</label>';
    });
};

window.generateManualPin = async function () {
    var examId = $('manual-exam-select').value;
    var deviceId = $('manual-device-id').value.trim().toUpperCase();
    var customPin = $('manual-pin-input').value.trim();
    var checked = document.querySelectorAll('input[name="manual-sub"]:checked');
    var subjects = Array.from(checked).map(function (cb) { return cb.value; });

    if (!deviceId) {
        return alert('Device ID is required.');
    }
    if (subjects.length === 0) {
        return alert('Select at least one subject.');
    }
    if (!customPin) {
        return alert('Enter a custom PIN.');
    }

    try {
        var result = await api('/admin/pins', {
            method: 'POST',
            body: {
                examId: examId,
                subjects: subjects,
                deviceId: deviceId,
                manualPin: customPin
            }
        });
        alert('PIN Generated: ' + result.pin);
        await loadPinHistory();
    } catch (err) {
        alert(err.message);
    }
};

async function loadPinHistory() {
    var tbody = $('pins-table-body');
    tbody.innerHTML = '';

    try {
        var pins = await api('/admin/pins');
        if (!Array.isArray(pins) || pins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">No PINs yet.</td></tr>';
            return;
        }

        pins.forEach(function (pin) {
            var status = pin.active ? '' : ' <span style="color:#d9534f; font-size:12px;">(pending)</span>';
            var subjects = Array.isArray(pin.subjects) ? pin.subjects.join(', ') : '';
            var date = pin.date ? new Date(pin.date).toLocaleDateString() : '';
            tbody.innerHTML +=
                '<tr>' +
                    '<td>' + escapeHtml(date) + '</td>' +
                    '<td>' + escapeHtml(pin.examName || 'Deleted Exam') + '</td>' +
                    '<td style="font-weight:bold; color:green;">' + escapeHtml(pin.pin) + status + '</td>' +
                    '<td><code>' + escapeHtml(pin.deviceId) + '</code></td>' +
                    '<td>' + escapeHtml(subjects) + '</td>' +
                    '<td><button type="button" class="danger-btn" onclick="withButtonLoading(this, \'Deleting...\', () => deletePin(\'' + escapeHtml(pin.pin) + '\'))">Delete</button></td>' +
                '</tr>';
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">' + escapeHtml(err.message) + '</td></tr>';
    }
}

window.deletePin = async function (pin) {
    if (!await confirmDeletion(
        'Are you sure you want to delete PIN ' + pin + '?',
        'This permanently removes the PIN and revokes access. Its order/payment history, if any, remains. This cannot be undone.',
        true
    )) {
        return;
    }
    try {
        await api('/admin/pins?pin=' + encodeURIComponent(pin), { method: 'DELETE' });
        await loadPinHistory();
        await initDashboardStats();
    } catch (err) {
        alert(err.message);
    }
};

async function loadOrders() {
    var tbody = $('orders-table-body');
    tbody.innerHTML = '';
    try {
        var orders = await api('/admin/orders');
        if (!Array.isArray(orders) || orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#666;">No orders yet.</td></tr>';
            return;
        }
        orders.forEach(function (order) {
            var date = order.createdAt ? new Date(order.createdAt).toLocaleString() : '';
            var amount = Number(order.amount) / 100;
            var formattedAmount = new Intl.NumberFormat('en-NG', {
                style: 'currency',
                currency: order.currency || 'NGN'
            }).format(amount);
            var pending = order.status === 'pending';
            tbody.innerHTML +=
                '<tr>' +
                    '<td>' + escapeHtml(date) + '</td>' +
                    '<td><code>' + escapeHtml(order.reference) + '</code></td>' +
                    '<td>' + escapeHtml(order.email) + '</td>' +
                    '<td>' + escapeHtml(formattedAmount) + '</td>' +
                    '<td>' + escapeHtml(order.status) + '</td>' +
                    '<td><code>' + escapeHtml(order.pin) + '</code></td>' +
                    '<td><button type="button" class="danger-btn" ' + (pending ? 'disabled title="Pending orders cannot be deleted"' : 'onclick="withButtonLoading(this, \'Deleting...\', () => deleteOrder(\'' + escapeHtml(order.reference) + '\'))"') + '>Delete</button></td>' +
                '</tr>';
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:red;">' + escapeHtml(err.message) + '</td></tr>';
    }
}

window.deleteOrder = async function (reference) {
    if (!await confirmDeletion(
        'Are you sure you want to delete order ' + reference + '?',
        'This permanently removes the order and payment history. If paid, its linked PIN is also deleted and access is revoked. This cannot be undone.',
        true
    )) {
        return;
    }
    try {
        await api('/admin/orders?reference=' + encodeURIComponent(reference), { method: 'DELETE' });
        await loadOrders();
        await loadPinHistory();
        await initDashboardStats();
    } catch (err) {
        alert(err.message);
    }
};

window.saveNews = async function () {
    var id = $('edit-news-id').value;
    var title = $('news-title').value.trim();
    var content = $('news-content').value.trim();
    var fileInput = $('news-image-upload');
    var button = $('news-submit-btn');

    if (!title || !content) {
        return alert('Title and Content are required.');
    }

    var imageUrls = id ? editingNewsImages.slice() : [];

    if (fileInput.files && fileInput.files.length > 0) {
        if (imageUrls.length + fileInput.files.length > 5) {
            return alert('You can only have up to 5 images per update.');
        }

        try {
            button.innerText = 'Uploading Images...';
            for (var index = 0; index < fileInput.files.length; index++) {
                imageUrls.push(await uploadFileToR2(fileInput.files[index]));
            }
        } catch (err) {
            button.innerText = id ? 'Update News' : 'Publish Update';
            return alert('Image upload failed: ' + err.message);
        }
    }

    button.innerText = id ? 'Updating...' : 'Publishing...';

    try {
        var body = { title: title, content: content, images: imageUrls };
        var result;
        if (id) {
            body.id = Number(id);
            result = await api('/admin/news?id=' + encodeURIComponent(id), { method: 'PUT', body: body });
        } else {
            result = await api('/admin/news', { method: 'POST', body: body });
        }

        alert(id ? 'News Updated!' : 'News Published!');
        showCleanupWarning(result);
        window.resetNewsForm();
        await loadNews();
    } catch (err) {
        alert(err.message);
        button.innerText = id ? 'Update News' : 'Publish Update';
    }
};

window.editNews = function (id) {
    var item = allNews.find(function (news) { return news.id === id; });
    if (!item) {
        return;
    }

    editingNewsImages = Array.isArray(item.images) ? item.images.slice() : [];
    $('edit-news-id').value = id;
    $('news-title').value = item.title;
    $('news-content').value = item.content;
    $('news-form-title').innerText = 'Edit Update';
    $('news-submit-btn').innerText = 'Update News';
    $('news-cancel-btn').style.display = 'inline-block';
    window.scrollTo(0, 0);
};

window.copyNewsLink = async function (id) {
    var url = window.location.origin + '/#news-' + id;
    try {
        await navigator.clipboard.writeText(url);
        alert('Direct link copied: ' + url);
    } catch (error) {
        alert('Could not copy the update link. ' + (error.message || ''));
    }
};

window.resetNewsForm = function () {
    editingNewsImages = [];
    $('edit-news-id').value = '';
    $('news-title').value = '';
    $('news-content').value = '';
    $('news-image-upload').value = '';
    $('news-form-title').innerText = 'Publish New Update';
    $('news-submit-btn').innerText = 'Publish Update';
    $('news-cancel-btn').style.display = 'none';
};

async function loadNews() {
    var list = $('news-list');
    list.innerHTML = 'Loading updates...';

    try {
        allNews = await api('/admin/news');
        list.innerHTML = '';

        if (!Array.isArray(allNews) || allNews.length === 0) {
            list.innerHTML = '<p>No news yet.</p>';
            return;
        }

        allNews.forEach(function (item) {
            var date = item.date ? new Date(item.date).toLocaleDateString() : '';
            var imagesHtml = '';
            if (Array.isArray(item.images) && item.images.length > 0) {
                imagesHtml = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">';
                item.images.forEach(function (img) {
                    imagesHtml += '<img src="' + escapeHtml(img) + '" alt="News image" style="max-height:100px; border-radius:5px; border:1px solid #ddd;">';
                });
                imagesHtml += '</div>';
            }

            list.innerHTML +=
                '<div style="background:white; border:1px solid #ddd; padding:15px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">' +
                    '<div style="width: 85%; min-width: 220px;">' +
                        '<h4 style="margin:0 0 5px 0; color:#001f5b;">' + escapeHtml(item.title) + '</h4>' +
                        '<p style="font-size:12px; color:#888; margin:0 0 10px 0;">' + escapeHtml(date) + '</p>' +
                        '<p style="margin:0; white-space:pre-wrap;">' + escapeHtml(item.content) + '</p>' +
                        imagesHtml +
                    '</div>' +
                    '<div style="display:flex; flex-direction:column; gap:5px;">' +
                        '<button type="button" onclick="withButtonLoading(this, \'Opening...\', () => editNews(' + Number(item.id) + '))" style="background:#ffcc00; color:#001f5b; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; font-weight:bold;">Edit</button>' +
                        '<button type="button" onclick="withButtonLoading(this, \'Copying...\', () => copyNewsLink(' + Number(item.id) + '))" style="background:#0088cc; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;">Copy Link</button>' +
                        '<button type="button" onclick="withButtonLoading(this, \'Deleting...\', () => deleteNews(' + Number(item.id) + '))" style="background:red; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;">Delete</button>' +
                    '</div>' +
                '</div>';
        });
    } catch (err) {
        list.innerHTML = '<p style="color:red;">' + escapeHtml(err.message) + '</p>';
    }
}

window.deleteNews = async function (id) {
    var item = allNews.find(function (news) { return news.id === id; });
    var title = item ? item.title : 'this update';
    if (!await confirmDeletion(
        'Are you sure you want to delete "' + title + '"?',
        'This permanently deletes the update and its images (unless an image is still used elsewhere).'
    )) {
        return;
    }

    try {
        var result = await api('/admin/news?id=' + encodeURIComponent(id), { method: 'DELETE' });
        if ($('edit-news-id').value === String(id)) {
            window.resetNewsForm();
        }
        await loadNews();
        showCleanupWarning(result);
    } catch (err) {
        alert(err.message);
    }
};

async function loadEnquiries() {
    var tbody = $('enquiry-table-body');
    tbody.innerHTML = '';

    try {
        allEnquiries = await api('/admin/enquiries');
        if (!Array.isArray(allEnquiries) || allEnquiries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#666;">No enquiries yet.</td></tr>';
            return;
        }

        allEnquiries.forEach(function (enq) {
            var date = enq.date ? new Date(enq.date).toLocaleDateString() : '';
            var cleanPhone = String(enq.phone || '').replace(/[^0-9]/g, '');
            var waMessage = 'Hello ' + (enq.name || '') + ', this is Success Academy. I received your enquiry regarding ' + (enq.exam || 'your exam') + '. How can I help you today?';
            var waLink = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waMessage);
            var replied = enq.repliedAt ? ' <span style="color:#25D366; font-size:11px;">(replied)</span>' : '';

            tbody.innerHTML +=
                '<tr>' +
                    '<td>' + escapeHtml(date) + replied + '</td>' +
                    '<td>' + escapeHtml(enq.name) + '</td>' +
                    '<td>' + escapeHtml(enq.phone) + '</td>' +
                    '<td>' + escapeHtml(enq.email) + '</td>' +
                    '<td>' + escapeHtml(enq.exam) + '</td>' +
                    '<td>' + escapeHtml(enq.message) + '</td>' +
                    '<td style="display: flex; gap: 5px; flex-wrap: wrap;">' +
                        '<button type="button" onclick="withButtonLoading(this, \'Opening...\', () => openReply(' + Number(enq.id) + '))" style="background: #0088cc; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;">Email</button>' +
                        '<a href="' + escapeHtml(waLink) + '" target="_blank" rel="noopener" style="background: #25D366; color: white; border: none; padding: 5px 10px; border-radius: 3px; font-size: 12px; text-decoration: none; display: inline-block;">WhatsApp</a>' +
                        '<button type="button" class="danger-btn" onclick="withButtonLoading(this, \'Deleting...\', () => deleteEnquiry(' + Number(enq.id) + '))">Delete</button>' +
                    '</td>' +
                '</tr>';
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:red;">' + escapeHtml(err.message) + '</td></tr>';
    }
}

window.deleteEnquiry = async function (id) {
    var enquiry = allEnquiries.find(function (item) { return item.id === id; });
    var identity = enquiry ? (enquiry.name || enquiry.email || ('enquiry #' + id)) : ('enquiry #' + id);
    if (!await confirmDeletion(
        'Are you sure you want to delete the enquiry from ' + identity + '?',
        'This permanently deletes the customer enquiry and its reply status. This cannot be undone.',
        true
    )) {
        return;
    }
    try {
        await api('/admin/enquiries?id=' + encodeURIComponent(id), { method: 'DELETE' });
        await loadEnquiries();
        await initDashboardStats();
    } catch (err) {
        alert(err.message);
    }
};

window.openReply = function (id) {
    var enquiry = allEnquiries.find(function (item) { return item.id === id; });
    if (!enquiry) {
        return;
    }

    currentReplyData = enquiry;
    setText('reply-name', enquiry.name);
    $('reply-message').value = '';
    $('email-status').innerText = '';
    $('reply-modal').style.display = 'flex';
};

window.closeModal = function () {
    $('reply-modal').style.display = 'none';
};

window.sendEmailReply = async function () {
    if (!currentReplyData) {
        return;
    }

    var message = $('reply-message').value.trim();
    var status = $('email-status');
    if (!message) {
        return alert('Type a message');
    }

    status.innerText = 'Sending...';
    status.style.color = 'blue';

    try {
        await api('/admin/enquiries', {
            method: 'POST',
            body: { id: currentReplyData.id, message: message }
        });
        status.style.color = 'green';
        status.innerText = 'Email Sent Successfully!';
        setTimeout(function () {
            window.closeModal();
            loadEnquiries();
        }, 1500);
    } catch (err) {
        status.style.color = 'red';
        status.innerText = err.message || 'Failed to send email. Use WhatsApp instead.';
    }
};

$('admin-password').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        window.checkPassword();
    }
});

window.onload = async function () {
    try {
        await api('/admin/session');
        showDashboard();
        await initDashboard();
    } catch (_err) {
        showLoginScreen();
    }
};
