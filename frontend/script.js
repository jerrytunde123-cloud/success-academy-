// ⚠️ REPLACE THIS WITH YOUR LIVE RENDER URL
const API_URL = 'https://success-academy-backend-mh1o.onrender.com/api'; 

var dbExams = [];
var currentExam = null;
var currentPackageType = null;
var currentPrice = 0;

const PLACEHOLDER_SELECT = 'https://placehold.co/300x150/001f5b/ffffff?text=Select+a+Subject';
const PLACEHOLDER_NO_IMAGE = 'https://placehold.co/300x150/001f5b/ffffff?text=No+Photo+Yet';

fetch(API_URL + '/visitors', { method: 'POST' }).catch(() => {});

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
    alert('Device ID Copied!');
}

function savePinLocally(pinData) {
    let history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
    if(!history.some(p => p.pin === pinData.pin)) {
        history.push(pinData);
        localStorage.setItem('sa_my_pins', JSON.stringify(history));
    }
}

function loadMyPinHistory() {
    var container = document.getElementById('pin-history-container');
    if (!container) return;
    container.innerHTML = '';
    let history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666;">You have not purchased any PINs on this device yet.</p>';
        return;
    }

    history.reverse().forEach(item => {
        const date = new Date(item.date).toLocaleDateString();
        const subjects = item.subjects.join(', ');
        const examName = item.examName || 'Unknown Exam';

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
    alert('PIN Copied: ' + text);
}

function showPage(pageId) {
    var mains = document.querySelectorAll('main');
    for(var i=0; i<mains.length; i++) mains[i].style.display = 'none';
    document.getElementById('page-' + pageId).style.display = 'block';
    
    if(pageId === 'verify') displayDeviceId();
    if(pageId === 'updates') fetchNews();
    if(pageId === 'history') loadMyPinHistory(); 
}

// ⚠️ FIXED: Now returns the fetch promise so we can call checkSharedLink after
function fetchExams() {
    return fetch(API_URL + '/exams', { cache: "no-store" })
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

function fetchNews() {
    var container = document.getElementById('news-container');
    container.innerHTML = 'Loading updates...';
    
    var hash = window.location.hash;
    var targetNewsId = null;
    if (hash && hash.startsWith('#news-')) {
        targetNewsId = parseInt(hash.replace('#news-', ''));
    }

    fetch(API_URL + '/news', { cache: "no-store" })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        container.innerHTML = '';
        if(data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666;">No updates yet. Check back later!</p>';
            return;
        }
        
        data.forEach(function(item) {
            var date = new Date(item.date).toLocaleDateString();
            var linkedContent = item.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#0088cc; text-decoration:underline; word-break:break-all;">$1</a>');
            var shortContent = linkedContent.substring(0, 80) + '...';
            var imagesHtml = '';
            if (item.images && item.images.length > 0) {
                imagesHtml = '<div style="display:flex; flex-wrap:wrap; gap:10px; margin:15px 0;">';
                item.images.forEach(img => { imagesHtml += `<img src="${img}" style="max-width:100%; max-height:300px; border-radius:8px; border:1px solid #ddd;">`; });
                imagesHtml += '</div>';
            }
            var isTarget = (targetNewsId === item.id);
            var displayStyle = isTarget ? 'block' : 'none';
            
            container.innerHTML += `
                <div id="news-${item.id}" style="background:white; padding:20px; border-radius:10px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.05); border-left: 5px solid var(--accent-yellow);">
                    <h3 style="color:var(--primary-blue); margin-bottom:5px;">${item.title}</h3>
                    <p style="font-size:12px; color:#888; margin-bottom:15px;">${date}</p>
                    <div id="short-${item.id}" style="display: ${isTarget ? 'none' : 'block'};">
                        <p style="white-space:pre-wrap; color:#333; line-height:1.6;">${shortContent}</p>
                        <button onclick="expandNews(${item.id})" style="background:none; border:none; color:var(--primary-blue); font-weight:bold; cursor:pointer; padding:0; margin-top:10px;">Read More →</button>
                    </div>
                    <div id="full-${item.id}" style="display: ${displayStyle};">
                        ${imagesHtml}
                        <p style="white-space:pre-wrap; color:#333; line-height:1.6;">${linkedContent}</p>
                        <button onclick="collapseNews(${item.id})" style="background:none; border:none; color:red; font-weight:bold; cursor:pointer; padding:0; margin-top:10px;">Show Less ↑</button>
                    </div>
                </div>
            `;
        });
    })
    .catch(function() { container.innerHTML = '<p style="color:red; text-align:center;">Failed to load updates.</p>'; });
}

window.expandNews = function(id) {
    document.getElementById('short-' + id).style.display = 'none';
    document.getElementById('full-' + id).style.display = 'block';
}

window.collapseNews = function(id) {
    document.getElementById('full-' + id).style.display = 'none';
    document.getElementById('short-' + id).style.display = 'block';
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
    var instructionText = document.getElementById('subject-instruction');

    if (packageType === 'per_subject') {
        currentPrice = currentExam.prices.per_subject;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'block';
        previewImg.src = PLACEHOLDER_SELECT;
        instructionText.style.display = 'none'; // Hide note
        
        var html = '';
        currentExam.subjects.forEach(function(sub) {
            html += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + sub.name + '" onchange="updatePreviewAndLimit(this, 1)"> ' + sub.name + '</label>';
        });
        subjectCheckboxes.innerHTML = html;
    } else if (packageType === 'per_dept') {
        currentPrice = currentExam.prices.per_dept;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'none';
        instructionText.style.display = 'block'; // ⚠️ SHOW NOTE
        
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
        instructionText.style.display = 'none';
    }
    document.getElementById('checkout-amount').innerText = '₦' + currentPrice;
    document.getElementById('checkout-modal').style.display = 'flex';
}

function updatePreviewAndLimit(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');
    
    if (max === 1) {
        checked.forEach(function(cb) {
            if(cb !== checkbox) cb.checked = false;
        });
    } else if (checked.length > max) {
        checkbox.checked = false; 
        alert('Max ' + max + ' subjects allowed.');
        return;
    }
    
    if (checkbox.checked) {
        var subData = currentExam.subjects.find(function(s) { return s.name === checkbox.value; });
        document.getElementById('subject-preview-img').src = subData.thumbnail || PLACEHOLDER_NO_IMAGE;
    } else {
        document.getElementById('subject-preview-img').src = PLACEHOLDER_SELECT;
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
            savePinLocally({
                pin: data.pin,
                examId: currentExam._id,
                examName: currentExam.name,
                subjects: subjectNames,
                date: new Date().toISOString()
            });

            document.getElementById('generated-pin').innerText = data.pin;
            document.getElementById('success-modal').style.display = 'flex';
        }
    })
    .catch(function() { alert('Error generating PIN.'); });
}

function verifyAndShowContent() {
    var inputPin = document.getElementById('user-pin-input').value.trim().toUpperCase();
    var errorMsg = document.getElementById('pin-error');
    var contentDisplay = document.getElementById('content-display');
    var answersDiv = document.getElementById('actual-answers');
    
    errorMsg.style.display = 'none';
    contentDisplay.style.display = 'none';
    
    if(!inputPin) return alert("Please enter a PIN.");

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
            return; 
        }
        
        contentDisplay.style.display = 'block';
        var pinData = result.data.data; 
        var examInfo = pinData.examId; 

        var contentText = "";
        
        if (pinData.subjects && examInfo && examInfo.subjects) {
            pinData.subjects.forEach(function(subName) {
                var subjectData = examInfo.subjects.find(function(s) { return s.name === subName; });
                if (subjectData && subjectData.content) {
                    contentText += '--- ' + subjectData.name.toUpperCase() + ' ---\n';
                    contentText += subjectData.content + '\n\n';
                }
            });
        }
        
        answersDiv.innerHTML = '<pre style="font-family:monospace; white-space:pre-wrap; margin-bottom:20px; color:black; font-size:16px;">' + contentText + '</pre>';
        
        if (pinData.subjects && examInfo && examInfo.subjects) {
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
        
        if(contentText.trim() === "" && answersDiv.innerHTML.indexOf('<img') === -1) {
            answersDiv.innerHTML = '<p style="color:red;">No content found. Please contact support.</p>';
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

// ⚠️ FIXED: Ensure shared links open the specific exam
function checkSharedLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const examSlug = urlParams.get('exam');
    if (examSlug) {
        const exam = dbExams.find(e => e.slug === examSlug);
        if(exam) openExamPackages(exam._id);
    }
}

window.onload = function() { 
    if(document.getElementById('home-exam-grid')) {
        fetchExams().then(() => {
            checkSharedLink();
        });
    }
};
 
