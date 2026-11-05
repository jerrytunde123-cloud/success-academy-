const API_URL = 'https://success-academy-backend-mh1o.onrender.com/api'; // ⚠️ REPLACE THIS

let dbExams = [];
let currentExam = null;
let currentPackageType = null;
let currentPrice = 0;

// --- DEVICE ID & LOCAL PIN STORAGE ---
function getDeviceId() {
    let deviceId = localStorage.getItem('sa_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        localStorage.setItem('sa_device_id', deviceId);
    }
    return deviceId;
}

function savePinLocally(pinData) {
    let history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
    // Prevent duplicates
    if(!history.some(p => p.pin === pinData.pin)) {
        history.push(pinData);
        localStorage.setItem('sa_my_pins', JSON.stringify(history));
    }
}

function loadMyPinHistory() {
    const container = document.getElementById('pin-history-container');
    if (!container) return;
    container.innerHTML = '';
    let history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666;">You have not purchased any PINs on this device yet.</p>';
        return;
    }

    history.reverse().forEach(item => {
        // Find exam name
        const exam = dbExams.find(e => e._id === item.examId);
        const examName = exam ? exam.name : 'Unknown Exam';
        const date = new Date(item.date).toLocaleDateString();
        const subjects = item.subjects.join(', ');

        container.innerHTML += `
            <div style="background:white; border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h4 style="color:var(--primary-blue); margin-bottom:5px;">${examName} <span style="font-size:12px; color:#666;">(${date})</span></h4>
                    <p style="font-size:14px; color:#444;"><strong>Subjects:</strong> ${subjects}</p>
                </div>
                <div style="text-align:center;">
                    <h3 style="color:green; letter-spacing:2px; margin-bottom:5px;">${item.pin}</h3>
                    <button onclick="copyToClipboard('${item.pin}')" style="background:#25D366; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; font-size:12px;">Copy PIN</button>
                </div>
            </div>
        `;
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert('Copied: ' + text);
}

// --- NAVIGATION & RENDERING ---
function showPage(pageId) {
    document.querySelectorAll('main').forEach(main => main.style.display = 'none');
    document.getElementById('page-' + pageId).style.display = 'block';
    if(pageId === 'history') loadMyPinHistory();
}

async function fetchExams() {
    try {
        const response = await fetch(`${API_URL}/exams`);
        dbExams = await response.json();
        renderExams();
        checkSharedLink(); // Check if user is visiting via a share link
    } catch (error) { console.error("Error fetching exams:", error); }
}

function renderExams() {
    const grid = document.getElementById('home-exam-grid');
    if (!grid) return;
    grid.innerHTML = '';
    dbExams.forEach(exam => {
        const card = document.createElement('div');
        card.className = 'exam-card';
        card.onclick = () => openExamPackages(exam._id);
        const fallbackImg = 'https://via.placeholder.com/60/001f5b/ffcc00?text=' + exam.name.substring(0,2);
        card.innerHTML = `<img src="${exam.logo || fallbackImg}" onerror="this.src='${fallbackImg}'"><h3 style="margin-top:10px; color:var(--primary-blue); font-size:16px;">${exam.name}</h3>`;
        grid.appendChild(card);
    });
}

// SHAREABLE LINKS LOGIC
function checkSharedLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('exam');
    if (examId) {
        openExamPackages(examId);
    }
}

function shareExamLink(examId) {
    const url = `${window.location.origin}${window.location.pathname}?exam=${examId}`;
    navigator.clipboard.writeText(url);
    alert('Shareable link copied! You can send this to users to take them directly to this exam.');
}

function openExamPackages(examId) {
    currentExam = dbExams.find(e => e._id === examId);
    if (!currentExam) return;

    document.getElementById('pkg-exam-title').innerText = currentExam.name + ' Packages';
    document.getElementById('share-link-btn').onclick = () => shareExamLink(examId);
    
    document.getElementById('price-per-subject').innerText = currentExam.prices.per_subject;
    document.getElementById('price-per-dept').innerText = currentExam.prices.per_dept;
    document.getElementById('price-all-subjects').innerText = currentExam.prices.all_subjects;

    document.getElementById('pkg-per-subject').style.display = currentExam.allow.per_subject ? 'block' : 'none';
    document.getElementById('pkg-per-dept').style.display = currentExam.allow.per_dept ? 'block' : 'none';
    document.getElementById('pkg-all-subjects').style.display = currentExam.allow.all_subjects ? 'block' : 'none';

    showPage('packages');
}

function openCheckout(packageType) {
    currentPackageType = packageType;
    const previewArea = document.getElementById('preview-image-area');
    const previewImg = document.getElementById('subject-preview-img');
    const subjectArea = document.getElementById('subject-selection-area');
    const subjectCheckboxes = document.getElementById('subject-checkboxes');

    if (packageType === 'per_subject') {
        currentPrice = currentExam.prices.per_subject;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'block';
        previewImg.src = 'https://via.placeholder.com/300x150?text=Select+a+Subject';
        subjectCheckboxes.innerHTML = currentExam.subjects.map(sub => `
            <label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="${sub.name}" onchange="updatePreviewAndLimit(this, 1)"> ${sub.name}</label>
        `).join('');
    } else if (packageType === 'per_dept') {
        currentPrice = currentExam.prices.per_dept;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'none';
        const maxSubs = (currentExam.name.includes('JAMB') || currentExam.name.includes('JUPEB') || currentExam.name.includes('IJMB')) ? 4 : 9;
        subjectCheckboxes.innerHTML = currentExam.subjects.map(sub => `
            <label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="${sub.name}" onchange="limitSubjects(this, ${maxSubs})"> ${sub.name}</label>
        `).join('');
    } else {
        currentPrice = currentExam.prices.all_subjects;
        subjectArea.style.display = 'none';
        previewArea.style.display = 'none';
    }
    document.getElementById('checkout-amount').innerText = '₦' + currentPrice;
    document.getElementById('checkout-modal').style.display = 'flex';
}

function updatePreviewAndLimit(checkbox, max) {
    const checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) { checkbox.checked = false; return; }
    if (checkbox.checked) {
        const subData = currentExam.subjects.find(s => s.name === checkbox.value);
        document.getElementById('subject-preview-img').src = subData.previewImage || 'https://via.placeholder.com/300x150?text=No+Preview';
    }
}

function limitSubjects(checkbox, max) {
    const checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) { checkbox.checked = false; alert('Max ' + max + ' subjects allowed.'); }
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function payWithPaystack() {
    let selectedSubjects = [];
    if (currentPackageType !== 'all_subjects') {
        document.querySelectorAll('input[name="subject"]:checked').forEach(cb => selectedSubjects.push(cb.value));
        if (selectedSubjects.length === 0) return alert('Select at least one subject.');
    }

    let handler = PaystackPop.setup({
        key: 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043', // ⚠️ REPLACE
        email: "student@example.com", 
        amount: currentPrice * 100, 
        callback: function(response) { generatePIN(selectedSubjects); }
    });
    handler.openIframe(); 
}

async function generatePIN(selectedSubjects) {
    closeModal('checkout-modal');
    const subjectNames = currentPackageType === 'all_subjects' ? currentExam.subjects.map(s => s.name) : selectedSubjects;
    try {
        const response = await fetch(`${API_URL}/pins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examId: currentExam._id, subjects: subjectNames, deviceId: getDeviceId() })
        });
        const data = await response.json();
        if (data.success) {
            // Save to local history
            savePinLocally({ 
                pin: data.pin, 
                examId: currentExam._id, 
                subjects: subjectNames, 
                date: new Date().toISOString() 
            });

            document.getElementById('generated-pin').innerText = data.pin;
            document.getElementById('success-modal').style.display = 'flex';
        }
    } catch (error) { alert('Error generating PIN.'); }
}

async function verifyAndShowContent() {
    const inputPin = document.getElementById('user-pin-input').value.toUpperCase();
    const errorMsg = document.getElementById('pin-error');
    try {
        const response = await fetch(`${API_URL}/pins/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: inputPin, deviceId: getDeviceId() })
        });
        const result = await response.json();
        if (!response.ok) { errorMsg.innerText = result.error; errorMsg.style.display = 'block'; return; }

        errorMsg.style.display = 'none';
        document.getElementById('content-display').style.display = 'block';
        let contentText = "";
        result.data.subjects.forEach(subName => {
            const subjectData = result.data.examId.subjects.find(s => s.name === subName);
            if (subjectData) contentText += `--- ${subjectData.name.toUpperCase()} ---\n${subjectData.content || 'No content yet'}\n\n`;
        });
        document.getElementById('actual-answers').innerText = contentText;
    } catch (error) { errorMsg.innerText = 'Connection error.'; errorMsg.style.display = 'block'; }
}

document.getElementById('enquiryForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        exam: document.getElementById('exam-select-enquiry').value,
        message: document.getElementById('message').value
    };
    try {
        await fetch(`${API_URL}/enquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        alert('Message sent successfully!'); this.reset();
    } catch (err) { alert('Failed to send message.'); }
});

window.onload = () => { if(document.getElementById('home-exam-grid')) fetchExams(); };
