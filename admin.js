// =========================
// SUCCESS ACADEMY - Admin JS
// Edit this file to change admin dashboard behavior.
// =========================

const API_URL = ''; // Same domain (Vercel)

let activeAdminExam = null;

function adminLogin() {
    const pass = document.getElementById('admin-pass').value;
    fetch(API_URL + '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
    }).then(function(res) { return res.json(); })
      .then(function(data) {
          if (data.ok) {
              document.getElementById('admin-login').style.display = 'none';
              document.getElementById('admin-dashboard').style.display = 'block';
              fetchExams();
          } else {
              alert('Wrong password.');
          }
      });
}

function adminLogout() {
    location.reload();
}

async function fetchExams() {
    try {
        const res = await fetch(API_URL + '/api/exams', { cache: 'no-store' });
        const exams = await res.json();
        const select = document.getElementById('admin-exam-select');
        select.innerHTML = '<option value="">-- Select Exam --</option>';
        exams.forEach(function(exam) {
            select.innerHTML += '<option value="' + (exam._id || exam.id) + '">' + exam.name + '</option>';
        });
    } catch (e) {
        console.error('Failed to load exams for admin', e);
    }
}

function loadExamConfig() {
    const examId = document.getElementById('admin-exam-select').value;
    if (!examId) {
        document.getElementById('exam-config-area').style.display = 'none';
        document.getElementById('content-upload-area').style.display = 'none';
        return;
    }

    fetch(API_URL + '/api/exams', { cache: 'no-store' })
        .then(function(res) { return res.json(); })
        .then(function(exams) {
            activeAdminExam = exams.find(function(e) { return (e._id || e.id) === examId; });
            if (!activeAdminExam) {return;}

            document.getElementById('exam-config-area').style.display = 'block';
            document.getElementById('content-upload-area').style.display = 'block';
            document.getElementById('config-exam-name').innerText = 'Configure ' + activeAdminExam.name;

            const prices = activeAdminExam.prices || {};
            const allow = activeAdminExam.allow || {};
            document.getElementById('price-per-subject').value = prices.per_subject || '';
            document.getElementById('price-per-dept').value = prices.per_dept || '';
            document.getElementById('price-all-subjects').value = prices.all_subjects || '';
            document.getElementById('allow-per-subject').checked = allow.per_subject === true;
            document.getElementById('allow-per-dept').checked = allow.per_dept === true;
            document.getElementById('allow-all').checked = allow.all_subjects === true;

            const subSelect = document.getElementById('admin-subject-select');
            subSelect.innerHTML = '';
            const subjects = activeAdminExam.subjects || [];
            subjects.forEach(function(sub) {
                const name = typeof sub === 'string' ? sub : sub.name;
                subSelect.innerHTML += '<option value="' + name + '">' + name + '</option>';
            });
            loadContentForSubject();
        });
}

function loadContentForSubject() {
    const subject = document.getElementById('admin-subject-select').value;
    const textarea = document.getElementById('admin-content-input');
    const imageInput = document.getElementById('admin-image-url');

    if (!activeAdminExam) {return;}
    const subjects = activeAdminExam.subjects || [];
    const subData = subjects.find(function(s) {
        const name = typeof s === 'string' ? s : s.name;
        return name === subject;
    });

    if (subData) {
        const content = typeof subData === 'string' ? subData : (subData.content || '');
        textarea.value = content;
        const images = typeof subData === 'string' ? {} : (subData.images || {});
        imageInput.value = images[subject] || subData.thumbnail || '';
    } else {
        textarea.value = '';
        imageInput.value = '';
    }
}

async function saveExamConfig() {
    if (!activeAdminExam) {return;}
    const prices = {
        per_subject: parseInt(document.getElementById('price-per-subject').value) || 0,
        per_dept: parseInt(document.getElementById('price-per-dept').value) || 0,
        all_subjects: parseInt(document.getElementById('price-all-subjects').value) || 0
    };
    const allow = {
        per_subject: document.getElementById('allow-per-subject').checked,
        per_dept: document.getElementById('allow-per-dept').checked,
        all_subjects: document.getElementById('allow-all').checked
    };

    try {
        const res = await fetch(API_URL + '/api/exams?id=' + encodeURIComponent(activeAdminExam.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prices: prices, allow: allow })
        });
        const data = await res.json();
        if (data.success) {alert('Configuration saved!');}
        else {alert('Save failed: ' + (data.error || 'unknown'));}
    } catch (e) {
        alert('Save failed.');
    }
}

async function saveContent() {
    if (!activeAdminExam) {return;}
    const subject = document.getElementById('admin-subject-select').value;
    const content = document.getElementById('admin-content-input').value;
    const imageUrl = document.getElementById('admin-image-url').value;

    try {
        const res = await fetch(API_URL + '/api/exams?id=' + encodeURIComponent(activeAdminExam.id) + '&subject=' + encodeURIComponent(subject), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: subject, content: content, imageUrl: imageUrl })
        });
        const data = await res.json();
        if (data.success) {alert('Content saved for ' + subject + '!');}
        else {alert('Save failed: ' + (data.error || 'unknown'));}
    } catch (e) {
        alert('Save failed.');
    }
}

document.getElementById('admin-subject-select')?.addEventListener('change', loadContentForSubject);
