const API_URL = 'https://success-academy-backend-mh1o.onrender.com/api'; 

var dbExams = [];
var currentExam = null;
var currentPackageType = null;
var currentPrice = 0;
const PLACEHOLDER = 'https://placehold.co/300x150/001f5b/ffffff?text=Select+a+Subject';

function getDeviceId() {
    var deviceId = localStorage.getItem('sa_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        localStorage.setItem('sa_device_id', deviceId);
    }
    return deviceId;
}

function displayDeviceId() {
    var display = document.getElementById('user-device-id-display');
    if(display) display.innerText = getDeviceId();
}

function copyDeviceId() {
    navigator.clipboard.writeText(getDeviceId());
    alert('Device ID Copied! Send this to Support on Telegram.');
}

function showPage(pageId) {
    var mains = document.querySelectorAll('main');
    for(var i=0; i<mains.length; i++) mains[i].style.display = 'none';
    document.getElementById('page-' + pageId).style.display = 'block';
    if(pageId === 'verify') displayDeviceId();
}

function fetchExams() {
    fetch(API_URL + '/exams', { cache: "no-store" })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        dbExams = data;
        renderExams();
    })
    .catch(function(error) { console.error("Error fetching exams:", error); });
}

function renderExams() {
    var grid = document.getElementById('home-exam-grid');
    if (!grid) return;
    grid.innerHTML = '';
    dbExams.forEach(function(exam) {
        var card = document.createElement('div');
        card.className = 'exam-card';
        card.onclick = function() { openExamPackages(exam._id); };
        var fallbackImg = 'https://placehold.co/60x60/001f5b/ffcc00?text=' + exam.name.substring(0,2);
        card.innerHTML = '<img src="' + (exam.logo || fallbackImg) + '" onerror="this.src=\'' + fallbackImg + '\'">' + 
                         '<h3 style="margin-top:10px; color:var(--primary-blue); font-size:16px;">' + exam.name + '</h3>';
        grid.appendChild(card);
    });
}

function openExamPackages(examId) {
    currentExam = dbExams.find(function(e) { return e._id === examId; });
    if (!currentExam) return;
    document.getElementById('pkg-exam-title').innerText = currentExam.name + ' Packages';
    
    var shareBtn = document.getElementById('share-link-btn');
    shareBtn.onclick = function() { 
        var url = window.location.origin + window.location.pathname + '?exam=' + currentExam.slug;
        navigator.clipboard.writeText(url);
        alert('Shareable link copied: ' + url);
    };
    
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
    var previewArea = document.getElementById('preview-image-area');
    var previewImg = document.getElementById('subject-preview-img');
    var subjectArea = document.getElementById('subject-selection-area');
    var subjectCheckboxes = document.getElementById('subject-checkboxes');

    if (packageType === 'per_subject') {
        currentPrice = currentExam.prices.per_subject;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'block';
        previewImg.src = PLACEHOLDER;
        var html = '';
        currentExam.subjects.forEach(function(sub) {
            html += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + sub.name + '" onchange="updatePreviewAndLimit(this, 1)"> ' + sub.name + '</label>';
        });
        subjectCheckboxes.innerHTML = html;
    } else if (packageType === 'per_dept') {
        currentPrice = currentExam.prices.per_dept;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'none';
        var maxSubs = (currentExam.name.includes('JAMB') || currentExam.name.includes('JUPEB') || currentExam.name.includes('IJMB')) ? 4 : 9;
        var html = '';
        currentExam.subjects.forEach(function(sub) {
            html += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + sub.name + '" onchange="limitSubjects(this, ' + maxSubs + ')"> ' + sub.name + '</label>';
        });
        subjectCheckboxes.innerHTML = html;
    } else {
        currentPrice = currentExam.prices.all_subjects;
        subjectArea.style.display = 'none';
        previewArea.style.display = 'none';
    }
    document.getElementById('checkout-amount').innerText = '₦' + currentPrice;
    document.getElementById('checkout-modal').style.display = 'flex';
}

function updatePreviewAndLimit(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) { checkbox.checked = false; return; }
    if (checkbox.checked) {
        var subData = currentExam.subjects.find(function(s) { return s.name === checkbox.value; });
        document.getElementById('subject-preview-img').src = subData.thumbnail || PLACEHOLDER;
    }
}

function limitSubjects(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) { checkbox.checked = false; alert('Max ' + max + ' subjects allowed.'); }
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function payWithPaystack() {
    var selectedSubjects = [];
    if (currentPackageType !== 'all_subjects') {
        var checked = document.querySelectorAll('input[name="subject"]:checked');
        checked.forEach(function(cb) { selectedSubjects.push(cb.value); });
        if (selectedSubjects.length === 0) return alert('Select at least one subject.');
    }
    var handler = PaystackPop.setup({
        key: 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043', 
        email: "student@example.com", 
        amount: currentPrice * 100, 
        callback: function(response) { generatePIN(selectedSubjects); }
    });
    handler.openIframe(); 
}

function generatePIN(selectedSubjects) {
    closeModal('checkout-modal');
    var subjectNames = currentPackageType === 'all_subjects' ? currentExam.subjects.map(function(s) { return s.name; }) : selectedSubjects;
    fetch(API_URL + '/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: currentExam._id, subjects: subjectNames, deviceId: getDeviceId() })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            document.getElementById('generated-pin').innerText = data.pin;
            document.getElementById('success-modal').style.display = 'flex';
        }
    })
    .catch(function() { alert('Error generating PIN.'); });
}

// ⚠️ FINAL VERIFICATION LOGIC ⚠️
function verifyAndShowContent() {
    var inputPin = document.getElementById('user-pin-input').value.trim().toUpperCase();
    var errorMsg = document.getElementById('pin-error');
    var contentDisplay = document.getElementById('content-display');
    var answersDiv = document.getElementById('actual-answers');
    
    errorMsg.style.display = 'none';
    contentDisplay.style.display = 'block';
    answersDiv.innerHTML = '<p style="color:blue;">Verifying PIN and loading data (wait 5s)...</p>';

    if(!inputPin) {
        answersDiv.innerHTML = '';
        return alert("Please enter a PIN.");
    }

    fetch(API_URL + '/pins/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: "no-store",
        body: JSON.stringify({ pin: inputPin, deviceId: getDeviceId() })
    })
    .then(function(response) {
        return response.json().then(function(data) { return { status: response.status, ok: response.ok, data: data }; });
    })
    .then(function(result) {
        if (!result.ok) { 
            errorMsg.innerText = result.data.error || 'Invalid PIN'; 
            errorMsg.style.display = 'block'; 
            contentDisplay.style.display = 'none';
            return; 
        }

        // The backend sends the fully populated exam object in result.data.examId
        var pinData = result.data;
        var examInfo = pinData.examId; // This is the full exam object

        var contentText = "";
        
        if (pinData.subjects && examInfo) {
            pinData.subjects.forEach(function(subName) {
                var subjectData = examInfo.subjects.find(function(s) { return s.name === subName; });
                if (subjectData) {
                    contentText += '--- ' + subjectData.name.toUpperCase() + ' ---\n';
                    contentText += (subjectData.content || 'No text content yet') + '\n\n';
                }
            });
        }
        
        answersDiv.innerHTML = '<pre style="font-family:monospace; white-space:pre-wrap; margin-bottom:20px;">' + contentText + '</pre>';
        
        if (pinData.subjects && examInfo) {
            pinData.subjects.forEach(function(subName) {
                var subjectData = examInfo.subjects.find(function(s) { return s.name === subName; });
                if (subjectData && subjectData.qaImages && subjectData.qaImages.length > 0) {
                    answersDiv.innerHTML += '<h4 style="margin-top:15px; color:var(--primary-blue);">' + subName + ' Images:</h4><div style="display:flex; flex-wrap:wrap; gap:10px;">';
                    subjectData.qaImages.forEach(function(imgUrl) {
                        answersDiv.innerHTML += '<img src="' + imgUrl + '" style="max-width:100%; border-radius:5px; border:1px solid #ddd;">';
                    });
                    answersDiv.innerHTML += '</div>';
                }
            });
        }
        
        if(contentText === "" && answersDiv.innerHTML.indexOf('<img') === -1) {
            answersDiv.innerHTML = '<p style="color:red;">No content found for the selected subjects. Please check the admin panel.</p>';
        }
    })
    .catch(function(error) { 
        console.error(error);
        errorMsg.innerText = 'Connection error. Please try again later.'; 
        errorMsg.style.display = 'block'; 
        contentDisplay.style.display = 'none';
    });
}

var enquiryForm = document.getElementById('enquiryForm');
if(enquiryForm) {
    enquiryForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var data = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            exam: document.getElementById('exam-select-enquiry').value,
            message: document.getElementById('message').value
        };
        fetch(API_URL + '/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function() { alert('Message sent successfully!'); enquiryForm.reset(); })
        .catch(function() { alert('Failed to send message.'); });
    });
}

window.onload = function() { 
    if(document.getElementById('home-exam-grid')) fetchExams(); 
};
