// =========================
// SUCCESS ACADEMY - Frontend
// Edit this file to change how the site behaves (exams, checkout, PIN verify).
// =========================

const API_URL = ''; // Same domain (Vercel), so relative path works locally and in production

// ⚠️ Paystack PUBLIC key only. Safe to expose in frontend.
// The SECRET key stays server-side in api/pins.js.
const PAYSTACK_PUBLIC_KEY = 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043';

let dbExams = [];
let currentExam = null;
let currentPackageType = null;
let currentPrice = 0;
let currentSelectedSubjects = [];

function getDeviceId() {
    let deviceId = localStorage.getItem('sa_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        localStorage.setItem('sa_device_id', deviceId);
    }
    return deviceId;
}

function showPage(pageId) {
    document.querySelectorAll('main').forEach(main => main.style.display = 'none');
    const el = document.getElementById('page-' + pageId);
    if (el) {el.style.display = 'block';}
    if (pageId === 'home') {
        const vc = document.getElementById('page-view-content');
        if (vc) {vc.style.display = 'none';}
    }
}

async function fetchExams() {
    const grid = document.getElementById('home-exam-grid');
    if (!grid) {return;}
    grid.innerHTML = '<p style="text-align:center; color:#666;">Loading exams...</p>';
    try {
        const res = await fetch(API_URL + '/api/exams', { cache: 'no-store' });
        dbExams = await res.json();
        renderExams();
        checkSharedLink();
    } catch (e) {
        grid.innerHTML = '<p style="color:red; text-align:center;">Failed to load exams.</p>';
    }
}

function renderExams() {
    const grid = document.getElementById('home-exam-grid');
    if (!grid) {return;}
    grid.innerHTML = '';
    dbExams.forEach(function(exam) {
        const card = document.createElement('div');
        card.className = 'exam-card';
        card.onclick = function() { openExamPackages(exam._id || exam.id); };
        const fallbackImg = 'https://placehold.co/60x60/001f5b/ffcc00?text=' + exam.name.substring(0, 2);
        card.innerHTML = '<img src="' + (exam.logo || fallbackImg) + '" onerror="this.src=\'' + fallbackImg + '\'">' +
                         '<h3 style="margin-top:10px; color:var(--primary-blue); font-size:16px;">' + exam.name + '</h3>';
        grid.appendChild(card);
    });
}

function openExamPackages(examId) {
    currentExam = dbExams.find(function(e) { return (e._id || e.id) === examId; });
    if (!currentExam) {return;}

    document.getElementById('pkg-exam-title').innerText = currentExam.name + ' Packages';
    const noteEl = document.getElementById('exam-note');
    if (noteEl) {noteEl.innerText = 'All ' + currentExam.name + ' questions and answers drop a day before the exam. Subscribe now to secure your PIN!';}

    const prices = currentExam.prices || {};
    document.getElementById('price-per-subject').innerText = prices.per_subject || 0;
    document.getElementById('price-per-dept').innerText = prices.per_dept || 0;
    document.getElementById('price-all-subjects').innerText = prices.all_subjects || 0;

    const allow = currentExam.allow || {};
    document.getElementById('pkg-per-subject').style.display = allow.per_subject ? 'block' : 'none';
    document.getElementById('pkg-per-dept').style.display = allow.per_dept ? 'block' : 'none';
    document.getElementById('pkg-all-subjects').style.display = allow.all_subjects ? 'block' : 'none';

    showPage('packages');
}

function openCheckout(packageType) {
    currentPackageType = packageType;
    currentSelectedSubjects = [];

    const previewArea = document.getElementById('preview-image-area');
    const previewImg = document.getElementById('subject-preview-img');
    const subjectArea = document.getElementById('subject-selection-area');
    const subjectCheckboxes = document.getElementById('subject-checkboxes');

    const prices = currentExam.prices || {};
    if (packageType === 'per_subject') {
        currentPrice = prices.per_subject || 0;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'block';
        previewImg.src = 'https://placehold.co/300x150/001f5b/ffffff?text=Select+a+Subject';
        const subjects = currentExam.subjects || [];
        subjectCheckboxes.innerHTML = subjects.map(function(sub) {
            const subName = typeof sub === 'string' ? sub : sub.name;
            return '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + subName + '" onchange="updatePreviewAndLimit(this, 1)"> ' + subName + '</label>';
        }).join('');
    } else if (packageType === 'per_dept') {
        currentPrice = prices.per_dept || 0;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'none';
        const maxSubs = (currentExam.name.includes('JAMB') || currentExam.name.includes('JUPEB') || currentExam.name.includes('IJMB') || currentExam.name.includes('POST UTME')) ? 4 : 9;
        const subjects = currentExam.subjects || [];
        subjectCheckboxes.innerHTML = subjects.map(function(sub) {
            const subName = typeof sub === 'string' ? sub : sub.name;
            return '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + subName + '" onchange="limitSubjects(this, ' + maxSubs + ')"> ' + subName + '</label>';
        }).join('');
    } else {
        currentPrice = prices.all_subjects || 0;
        subjectArea.style.display = 'none';
        previewArea.style.display = 'none';
    }

    document.getElementById('checkout-title').innerText = currentExam.name + ' - ' + packageType.replace(/_/g, ' ');
    document.getElementById('checkout-amount').innerText = '₦' + currentPrice;
    document.getElementById('checkout-modal').style.display = 'flex';
}

function updatePreviewAndLimit(checkbox, max) {
    const checked = document.querySelectorAll('input[name="subject"]:checked');
    if (max === 1) {
        checked.forEach(function(cb) { if (cb !== checkbox) {cb.checked = false;} });
    } else if (checked.length > max) {
        checkbox.checked = false;
        alert('Max ' + max + ' subjects allowed.');
        return;
    }
    if (checkbox.checked) {
        document.getElementById('subject-preview-img').src = 'https://placehold.co/300x150/001f5b/ffffff?text=' + checkbox.value;
    } else {
        document.getElementById('subject-preview-img').src = 'https://placehold.co/300x150/001f5b/ffffff?text=Select+a+Subject';
    }
}

function limitSubjects(checkbox, max) {
    const checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) {
        checkbox.checked = false;
        alert('Max ' + max + ' subjects allowed.');
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function payWithPaystack() {
    let selectedSubjects = [];
    if (currentPackageType !== 'all_subjects') {
        const checked = document.querySelectorAll('input[name="subject"]:checked');
        checked.forEach(function(cb) { selectedSubjects.push(cb.value); });
        if (selectedSubjects.length === 0) {
            alert('Please select at least one subject.');
            return;
        }
    }

    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: 'student@example.com',
        amount: currentPrice * 100,
        currency: 'NGN',
        ref: 'SA_' + Math.floor(Math.random() * 1000000000),
        callback: function(response) {
            generatePIN(selectedSubjects);
        },
        onClose: function() {
            alert('Payment window closed.');
        }
    });
    handler.openIframe();
}

async function generatePIN(selectedSubjects) {
    closeModal('checkout-modal');
    const subjectNames = currentPackageType === 'all_subjects'
        ? (currentExam.subjects || []).map(function(s) { return typeof s === 'string' ? s : s.name; })
        : selectedSubjects;

    try {
        const res = await fetch(API_URL + '/api/pins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: currentExam._id || currentExam.id,
                subjects: subjectNames,
                deviceId: getDeviceId()
            })
        });
        const data = await res.json();
        if (data.success) {
            savePinLocally({
                pin: data.pin,
                examId: currentExam._id || currentExam.id,
                examName: currentExam.name,
                subjects: subjectNames,
                date: new Date().toISOString()
            });
            document.getElementById('generated-pin').innerText = data.pin;
            document.getElementById('success-modal').style.display = 'flex';
        } else {
            alert('Error generating PIN: ' + (data.error || 'unknown'));
        }
    } catch (e) {
        alert('Error generating PIN.');
    }
}

function savePinLocally(pinData) {
    let history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
    if (!history.some(p => p.pin === pinData.pin)) {
        history.push(pinData);
        localStorage.setItem('sa_my_pins', JSON.stringify(history));
    }
}

async function verifyAndShowContent() {
    const inputPin = document.getElementById('user-pin-input').value.trim().toUpperCase();
    const errorMsg = document.getElementById('pin-error');
    const contentDisplay = document.getElementById('content-display');
    const answersDiv = document.getElementById('actual-answers');

    if (!inputPin) {return alert('Please enter a PIN.');}

    errorMsg.style.display = 'none';
    contentDisplay.style.display = 'none';
    answersDiv.innerText = 'Loading content...';
    contentDisplay.style.display = 'block';

    try {
        const res = await fetch(API_URL + '/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: inputPin, deviceId: getDeviceId() })
        });
        const data = await res.json();

        if (!res.ok) {
            errorMsg.innerText = data.error || 'Invalid PIN';
            errorMsg.style.display = 'block';
            contentDisplay.style.display = 'none';
            return;
        }

        const pinData = data.data;
        const examInfo = pinData.examId;
        let contentText = '';

        if (pinData.subjects && examInfo && examInfo.subjects) {
            pinData.subjects.forEach(function(subName) {
                const subjectData = examInfo.subjects.find(function(s) {
                    const sName = typeof s === 'string' ? s : s.name;
                    return sName === subName;
                });
                if (subjectData) {
                    const subContent = typeof subjectData === 'string' ? subjectData : (subjectData.content || '');
                    contentText += '--- ' + subName.toUpperCase() + ' ---\n' + subContent + '\n\n';
                }
            });
        }

        answersDiv.innerText = contentText || 'No content found. Please contact support.';
    } catch (e) {
        errorMsg.innerText = 'Connection error. Please try again later.';
        errorMsg.style.display = 'block';
        contentDisplay.style.display = 'none';
    }
}

function submitEnquiry(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        exam: document.getElementById('exam').value,
        message: document.getElementById('message').value
    };
    fetch(API_URL + '/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(function() {
        alert('Message sent successfully!');
        document.getElementById('enquiryForm').reset();
    }).catch(function() {
        alert('Failed to send message.');
    });
}

function checkSharedLink() {
    const params = new URLSearchParams(window.location.search);
    const examSlug = params.get('exam');
    if (examSlug && dbExams.length > 0) {
        const exam = dbExams.find(e => (e.slug || e.name.toLowerCase().replace(/\s+/g, '-')) === examSlug);
        if (exam) {openExamPackages(exam._id || exam.id);}
    }
}

window.onload = function() {
    if (document.getElementById('home-exam-grid')) {
        fetchExams();
    }
};
