// ⚠️ REPLACE THIS WITH YOUR LIVE RENDER URL
const API_URL = 'https://success-academy-backend-mh1o.onrender.com/'; 

let dbExams = [];
let currentExam = null;
let currentPackageType = null;
let currentPrice = 0;

function getDeviceId() {
    let deviceId = localStorage.getItem('sa_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        localStorage.setItem('sa_device_id', deviceId);
    }
    return deviceId;
}

function displayDeviceId() {
    const display = document.getElementById('user-device-id-display');
    if(display) display.innerText = getDeviceId();
}

function copyDeviceId() {
    const deviceId = getDeviceId();
    navigator.clipboard.writeText(deviceId);
    alert('Device ID Copied! Send this to Support on Telegram if you need help recovering a PIN.');
}

function showPage(pageId) {
    document.querySelectorAll('main').forEach(main => main.style.display = 'none');
    document.getElementById('page-' + pageId).style.display = 'block';
    if(pageId === 'verify') displayDeviceId();
    if(pageId === 'home') fetchExams(); // Refresh data when returning to home
}

async function fetchExams() {
    try {
        // ⚠️ FORCE NO-CACHE: This ensures admin changes appear immediately
        const response = await fetch(`${API_URL}/exams`, { cache: "no-store" });
        dbExams = await response.json();
        renderExams();
        checkSharedLink(); 
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

function checkSharedLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const examSlug = urlParams.get('exam');
    if (examSlug) {
        const exam = dbExams.find(e => e.slug === examSlug);
        if(exam) openExamPackages(exam._id);
    }
}

function shareExamLink(examSlug) {
    const url = `${window.location.origin}${window.location.pathname}?exam=${examSlug}`;
    navigator.clipboard.writeText(url);
    alert('Shareable link copied: ' + url);
}

function openExamPackages(examId) {
    currentExam = dbExams.find(e => e._id === examId);
    if (!currentExam) return;

    document.getElementById('pkg-exam-title').innerText = currentExam.name + ' Packages';
    document.getElementById('share-link-btn').onclick = () => shareExamLink(currentExam.slug);
    
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
        document.getElementById('subject-preview-img').src = subData.thumbnail || 'https://via.placeholder.com/300x150?text=No+Preview';
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
        key: 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043
', // ⚠️ REPLACE WITH LIVE KEY
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
            document.getElementById('generated-pin').innerText = data.pin;
            document.getElementById('success-modal').style.display = 'flex';
        }
    } catch (error) { alert('Error generating PIN.'); }
}

async function verifyAndShowContent() {
    const inputPin = document.getElementById('user-pin-input').value.trim().toUpperCase();
    const errorMsg = document.getElementById('pin-error');
    
    errorMsg.style.display = 'none';
    document.getElementById('content-display').style.display = 'none';

    if(!inputPin) return alert("Please enter a PIN.");

    try {
        // Force no-cache here too
        const response = await fetch(`${API_URL}/pins/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: "no-store",
            body: JSON.stringify({ pin: inputPin, deviceId: getDeviceId() })
        });
        
        const result = await response.json();
        
        if (!response.ok) { 
            errorMsg.innerText = result.error || 'Invalid PIN'; 
            errorMsg.style.display = 'block'; 
            return; 
        }

        document.getElementById('content-display').style.display = 'block';
        const examInfo = dbExams.find(e => e._id === result.data.examId._id);
        let contentText = "";
        
        if (result.data.subjects) {
            result.data.subjects.forEach(subName => {
                const subjectData = examInfo.subjects.find(s => s.name === subName);
                if (subjectData) {
                    contentText += `--- ${subjectData.name.toUpperCase()} ---\n${subjectData.content || 'No text content yet'}\n\n`;
                }
            });
        }
        
        const answersDiv = document.getElementById('actual-answers');
        answersDiv.innerHTML = `<pre style="font-family:monospace; white-space:pre-wrap;">${contentText}</pre>`;
        
        if (result.data.subjects) {
            result.data.subjects.forEach(subName => {
                const subjectData = examInfo.subjects.find(s => s.name === subName);
                if (subjectData && subjectData.qaImages && subjectData.qaImages.length > 0) {
                    answersDiv.innerHTML += `<h4 style="margin-top:15px; color:var(--primary-blue);">${subName} Images:</h4><div style="display:flex; flex-wrap:wrap; gap:10px;">`;
                    subjectData.qaImages.forEach(imgUrl => {
                        answersDiv.innerHTML += `<img src="${imgUrl}" style="max-width:100%; border-radius:5px; border:1px solid #ddd;">`;
                    });
                    answersDiv.innerHTML += `</div>`;
                }
            });
        }

    } catch (error) { 
        console.error(error);
        errorMsg.innerText = 'Connection error. Please try again later.'; 
        errorMsg.style.display = 'block'; 
    }
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
