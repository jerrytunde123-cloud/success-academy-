// Success Academy — public site logic.
// Several functions are called from inline handlers in index.html.
/* eslint-disable no-unused-vars */
const API_URL = '/api';

var dbExams = [];
var currentExam = null;
var currentPackageType = null;
var currentPrice = 0;
var paystackPublicKey = null;
var paystackPublicKeyPromise = null;
var selectedTutorialExam = null;

const FALLBACK_PAYSTACK_PUBLIC_KEY = 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043';
const PLACEHOLDER_SELECT = 'https://placehold.co/300x150/001f5b/ffffff?text=Select+a+Subject';
const PLACEHOLDER_NO_IMAGE = 'https://placehold.co/300x150/001f5b/ffffff?text=No+Photo+Yet';

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

fetch(API_URL + '/visitors', { method: 'POST' }).catch(function (error) {
    console.warn('Visitor tracking failed:', error);
});

function isPaystackReady() {
    return typeof PaystackPop === 'function' && PaystackPop.prototype && typeof PaystackPop.prototype.resumeTransaction === 'function';
}

function whenPaystackReady(timeoutMs) {
    var limit = timeoutMs || 20000;
    if (isPaystackReady()) {return Promise.resolve(true);}
    return new Promise(function (resolve) {
        var started = Date.now();
        var timer = setInterval(function () {
            if (isPaystackReady()) { clearInterval(timer); resolve(true); return; }
            if (Date.now() - started > limit) { clearInterval(timer); resolve(false); }
        }, 200);
    });
}

function getPaystackPublicKey() {
    if (paystackPublicKey) {return Promise.resolve(paystackPublicKey);}
    if (paystackPublicKeyPromise) {return paystackPublicKeyPromise;}
    paystackPublicKeyPromise = fetch(API_URL + '/config')
        .then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { if (!response.ok) {throw new Error(data.error);} return data; }); })
        .then(function (data) { paystackPublicKey = (data && data.paystackPublicKey) || FALLBACK_PAYSTACK_PUBLIC_KEY; return paystackPublicKey; })
        .catch(function () { paystackPublicKey = FALLBACK_PAYSTACK_PUBLIC_KEY; return paystackPublicKey; })
        .then(function (key) { paystackPublicKeyPromise = null; return key; });
    return paystackPublicKeyPromise;
}

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getDeviceId() {
    var deviceId = null;
    try { deviceId = localStorage.getItem('sa_device_id'); } catch (_err) { deviceId = null; }
    if (!deviceId || !/^DEV-[A-Z0-9_-]{4,60}$/.test(deviceId)) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        try {
            localStorage.setItem('sa_device_id', deviceId);
        } catch (_err) {
            // The device ID still works for this page session.
        }
    }
    return deviceId;
}

function displayDeviceId() {
    var display = document.getElementById('user-device-id-display');
    if (display) {display.innerText = getDeviceId();}
}

async function copyDeviceId() {
    try {
        await navigator.clipboard.writeText(getDeviceId());
        alert('Device ID Copied!');
    } catch (error) {
        alert('Could not copy the device ID. ' + (error.message || ''));
    }
}

function savePinLocally(pinData) {
    try {
        var history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
        if (!history.some(function (p) { return p.pin === pinData.pin; })) {
            history.push(pinData);
            localStorage.setItem('sa_my_pins', JSON.stringify(history));
        }
    } catch (_err) {
        // PIN history is optional when browser storage is unavailable.
    }
}

function loadMyPinHistory() {
    var container = document.getElementById('pin-history-container');
    if (!container) {return;}
    container.innerHTML = '';
    var history = [];
    try { history = JSON.parse(localStorage.getItem('sa_my_pins')) || []; } catch (_err) { history = []; }
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666;">You have not purchased any PINs on this device yet.</p>';
        return;
    }
    history.slice().reverse().forEach(function (item) {
        var date = new Date(item.date).toLocaleDateString();
        var subjects = Array.isArray(item.subjects) ? item.subjects.join(', ') : '';
        var examName = item.examName || 'Unknown Exam';
        container.innerHTML += '<div style="background:white; border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">' +
            '<div><h4 style="color:var(--primary-blue); margin-bottom:5px;">' + escapeHtml(examName) + ' <span style="font-size:12px; color:#666;">(' + escapeHtml(date) + ')</span></h4>' +
            '<p style="font-size:14px; color:#444;"><strong>Subjects:</strong> ' + escapeHtml(subjects) + '</p></div>' +
            '<div style="text-align:center;"><h3 style="color:green; letter-spacing:2px; margin-bottom:5px;">' + escapeHtml(item.pin) + '</h3>' +
            '<button onclick="withButtonLoading(this, \'Copying...\', () => copyToClipboard(' + JSON.stringify(String(item.pin)).replace(/"/g, '&quot;') + '))" style="background:#25D366; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; font-size:12px;">Copy PIN</button></div></div>';
    });
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert('PIN Copied: ' + text);
    } catch (error) {
        alert('Could not copy the PIN. ' + (error.message || ''));
    }
}

function linkify(value) {
    return escapeHtml(value).replace(/(https?:\/\/[^\s<]+)/g, function (url) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color:#0088cc; text-decoration:underline; word-break:break-all;">' + url + '</a>';
    });
}

function fetchNews() {
    var container = document.getElementById('news-container');
    if (!container) {return;}
    container.innerHTML = 'Loading updates...';

    var hash = window.location.hash;
    var targetNewsId = hash && hash.indexOf('#news-') === 0
        ? parseInt(hash.replace('#news-', ''), 10)
        : null;

    fetch(API_URL + '/news', { cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) {throw new Error('Could not load updates.');}
            return response.json();
        })
        .then(function (data) {
            container.innerHTML = '';
            if (!Array.isArray(data) || data.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666;">No updates yet. Check back later!</p>';
                return;
            }

            data.forEach(function (item) {
                var date = item.date ? new Date(item.date).toLocaleDateString() : '';
                var content = typeof item.content === 'string' ? item.content : '';
                var linkedContent = linkify(content);
                var shortContent = escapeHtml(content.substring(0, 80)) + (content.length > 80 ? '...' : '');
                var imagesHtml = '';
                if (Array.isArray(item.images) && item.images.length > 0) {
                    imagesHtml = '<div style="display:flex; flex-wrap:wrap; gap:10px; margin:15px 0;">';
                    item.images.forEach(function (image) {
                        if (/^https?:\/\//i.test(String(image))) {
                            imagesHtml += '<img src="' + escapeHtml(image) + '" alt="News image" style="max-width:100%; max-height:300px; border-radius:8px; border:1px solid #ddd;">';
                        }
                    });
                    imagesHtml += '</div>';
                }

                var isTarget = targetNewsId === item.id;
                container.innerHTML +=
                    '<div id="news-' + Number(item.id) + '" style="background:white; padding:20px; border-radius:10px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.05); border-left:5px solid var(--accent-yellow);">' +
                        '<h3 style="color:var(--primary-blue); margin-bottom:5px;">' + escapeHtml(item.title) + '</h3>' +
                        '<p style="font-size:12px; color:#888; margin-bottom:15px;">' + escapeHtml(date) + '</p>' +
                        '<div id="short-' + Number(item.id) + '" style="display:' + (isTarget ? 'none' : 'block') + ';">' +
                            '<p style="white-space:pre-wrap; color:#333; line-height:1.6;">' + shortContent + '</p>' +
                            '<button type="button" onclick="expandNews(' + Number(item.id) + ')" style="background:none; border:none; color:var(--primary-blue); font-weight:bold; cursor:pointer; padding:0; margin-top:10px;">Read More &rarr;</button>' +
                        '</div>' +
                        '<div id="full-' + Number(item.id) + '" style="display:' + (isTarget ? 'block' : 'none') + ';">' +
                            imagesHtml +
                            '<p style="white-space:pre-wrap; color:#333; line-height:1.6;">' + linkedContent + '</p>' +
                            '<button type="button" onclick="collapseNews(' + Number(item.id) + ')" style="background:none; border:none; color:red; font-weight:bold; cursor:pointer; padding:0; margin-top:10px;">Show Less &uarr;</button>' +
                        '</div>' +
                    '</div>';
            });
        })
        .catch(function () {
            container.innerHTML = '<p style="color:red; text-align:center;">Failed to load updates.</p>';
        });
}

window.expandNews = function (id) {
    var shortEl = document.getElementById('short-' + id);
    var fullEl = document.getElementById('full-' + id);
    if (shortEl) {shortEl.style.display = 'none';}
    if (fullEl) {fullEl.style.display = 'block';}
};

window.collapseNews = function (id) {
    var shortEl = document.getElementById('short-' + id);
    var fullEl = document.getElementById('full-' + id);
    if (fullEl) {fullEl.style.display = 'none';}
    if (shortEl) {shortEl.style.display = 'block';}
};

function showPage(pageId) {
    var mains = document.querySelectorAll('main');
    for (var i = 0; i < mains.length; i++) {mains[i].style.display = 'none';}
    var target = document.getElementById('page-' + pageId);
    if (target) {target.style.display = 'block';}
    if (pageId === 'verify') {displayDeviceId();}
    if (pageId === 'updates') {fetchNews();}
    if (pageId === 'history') {loadMyPinHistory();}
    if (pageId === 'tutorials') {openTutorialsPage();} // Load tutorials
}

function fetchExams() {
    return fetch(API_URL + '/exams', { cache: 'no-store' })
        .then(function (response) { if (!response.ok) {throw new Error('Could not load exams.');} return response.json(); })
        .then(function (data) { dbExams = Array.isArray(data) ? data : []; renderExams(); })
        .catch(function (error) { console.error('Error fetching exams:', error); });
}

function renderExams() {
    var grid = document.getElementById('home-exam-grid');
    if (!grid) {return;}
    grid.innerHTML = '';
    dbExams.forEach(function (exam) {
        var card = document.createElement('div');
        card.className = 'exam-card';
        card.onclick = function () { openExamPackages(exam.id); };
        var fallbackImg = 'https://placehold.co/60x60/001f5b/ffcc00?text=' + encodeURIComponent(exam.name.substring(0, 2));
        var img = document.createElement('img'); img.src = exam.logo || fallbackImg; img.alt = exam.name;
        img.onerror = function () { this.onerror = null; this.src = fallbackImg; };
        var title = document.createElement('h3'); title.style.marginTop = '10px'; title.style.color = 'var(--primary-blue)'; title.style.fontSize = '16px'; title.textContent = exam.name;
        card.appendChild(img); card.appendChild(title); grid.appendChild(card);
    });
    
    // ⚠️ ADD TUTORIAL CARD
    var tutCard = document.createElement('div');
    tutCard.className = 'exam-card';
    tutCard.onclick = function () { showPage('tutorials'); };
    tutCard.innerHTML = '<img src="https://placehold.co/60x60/001f5b/ffcc00?text=TUT" alt="Tutorials"><h3 style="margin-top:10px; color:var(--primary-blue); font-size:16px;">Tutorials & Classes</h3>';
    grid.appendChild(tutCard);
}

// ⚠️ TUTORIAL PAGE LOGIC
function openTutorialsPage() {
    document.getElementById('tutorial-details').style.display = 'none';
    var grid = document.getElementById('tutorial-exam-grid');
    grid.innerHTML = 'Loading...';

    fetch(API_URL + '/exams', { cache: 'no-store' })
        .then(function (res) {
            if (!res.ok) {throw new Error('Could not load exams.');}
            return res.json();
        })
        .then(function(data) {
            dbExams = Array.isArray(data) ? data : [];
            renderTutorialGrid();
        })
        .catch(function() { grid.innerHTML = '<p style="color:red;">Failed to load tutorials. Please try again later.</p>'; });
}

function renderTutorialGrid() {
    var grid = document.getElementById('tutorial-exam-grid');
    grid.innerHTML = '';
    var hasTutorials = false;

    dbExams.forEach(function (exam) {
        // Check if tutorialPrice is greater than 0
        if (exam.tutorialAvailable) {
            hasTutorials = true;
            var card = document.createElement('div');
            card.className = 'exam-card';
            card.onclick = function () { showTutorialDetails(exam); };
            var fallbackImg = 'https://placehold.co/60x60/001f5b/ffcc00?text=' + exam.name.substring(0, 2);
            
            var img = document.createElement('img');
            img.src = exam.logo || fallbackImg;
            img.alt = exam.name;
            img.onerror = function() { this.onerror = null; this.src = fallbackImg; };
            
            var title = document.createElement('h3');
            title.style.marginTop = '10px';
            title.style.color = 'var(--primary-blue)';
            title.style.fontSize = '16px';
            title.textContent = exam.name;
            
            card.appendChild(img);
            card.appendChild(title);
            grid.appendChild(card);
        }
    });

    if (!hasTutorials) {
        grid.innerHTML = '<p style="text-align:center; color:#666; grid-column: 1 / -1;">No tutorials are currently available. Check back later!</p>';
    }
}

function showTutorialDetails(exam) {
    selectedTutorialExam = exam;
    document.getElementById('tut-exam-name').innerText = exam.name + ' Tutorials & Classes';
    document.getElementById('tut-benefits').innerText = exam.tutorialBenefits || 'No details provided.';
    document.getElementById('tut-price').innerText = exam.tutorialPrice;
    document.getElementById('tutorial-details').style.display = 'block';
    document.getElementById('tutorial-checkout-form').style.display = 'block';
    var previousSuccess = document.getElementById('tutorial-payment-success');
    if (previousSuccess) {previousSuccess.remove();}
    var previousError = document.getElementById('tutorial-payment-error');
    if (previousError) {previousError.remove();}
    try {
        document.getElementById('tutorial-email').value = localStorage.getItem('sa_email') || '';
    } catch (_err) {
        document.getElementById('tutorial-email').value = '';
    }
    window.scrollTo(0, 0);
}

async function payForTutorial() {
    if (!selectedTutorialExam) {return;}
    var emailInput = document.getElementById('tutorial-email');
    var email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        emailInput.focus();
        alert('Enter a valid email address for your receipt.');
        return;
    }

    var examId = selectedTutorialExam.id;
    var button = document.querySelector('#tutorial-details .btn-buy');
    var originalText = button.innerText;
    var resetButton = function () {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerText = originalText;
    };
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerText = 'Starting payment...';

    try {
        var ready = await whenPaystackReady();
        if (!ready) {throw new Error('Payment library could not load.');}
        try {
            localStorage.setItem('sa_email', email);
        } catch (_err) {
            // Checkout can continue without remembering the email.
        }

        var response = await fetch(API_URL + '/tutorials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'initialize', examId: examId, email: email })
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) {throw new Error(data.error || 'Could not start tutorial checkout.');}

        var popup = new PaystackPop();
        popup.resumeTransaction(data.accessCode, {
            onSuccess: function (transaction) {
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                button.innerText = 'Verifying payment...';
                verifyTutorialPayment(examId, transaction.reference || data.reference).finally(resetButton);
            },
            onCancel: resetButton,
            onError: function (error) {
                resetButton();
                alert((error && error.message) || 'Payment could not load.');
            }
        });
    } catch (error) {
        resetButton();
        alert(error.message || 'Could not start tutorial checkout.');
    }
}

async function verifyTutorialPayment(examId, reference) {
    try {
        var payload = { action: 'verify', reference: reference };
        if (examId) {payload.examId = examId;}
        var response = await fetch(API_URL + '/tutorials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) {throw new Error(data.error || 'Payment could not be verified.');}

        var details = document.getElementById('tutorial-details');
        details.style.display = 'block';
        var checkoutForm = document.getElementById('tutorial-checkout-form');
        if (checkoutForm) {checkoutForm.style.display = 'none';}
        var previousSuccess = document.getElementById('tutorial-payment-success');
        if (previousSuccess) {previousSuccess.remove();}
        var success = document.createElement('div');
        success.id = 'tutorial-payment-success';
        success.style.cssText = 'background:#e8f5e9;border:2px solid #4caf50;padding:20px;border-radius:10px;text-align:center;';
        var heading = document.createElement('h3');
        heading.textContent = 'Payment Successful' + (data.examName ? ' — ' + data.examName : '') + '!';
        heading.style.color = '#2e7d32';
        var message = document.createElement('p');
        message.textContent = 'Click below to join your tutorial class.';
        var link = document.createElement('a');
        link.href = data.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Join Class Now';
        link.style.cssText = 'background:#25D366;color:white;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:15px;';
        success.appendChild(heading);
        success.appendChild(message);
        success.appendChild(link);
        details.appendChild(success);
        if (window.location.search) {
            try {
                window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            } catch (_err) {
                // Payment verification is complete even if the URL cannot be cleaned.
            }
        }
    } catch (error) {
        var failureDetails = document.getElementById('tutorial-details');
        failureDetails.style.display = 'block';
        var failurePreviousError = document.getElementById('tutorial-payment-error');
        if (failurePreviousError) {failurePreviousError.remove();}
        var failure = document.createElement('div');
        failure.id = 'tutorial-payment-error';
        failure.style.cssText = 'background:#fff4e5;border:1px solid #f0ad4e;padding:15px;border-radius:8px;margin-top:15px;text-align:center;';
        var failureMessage = document.createElement('p');
        failureMessage.textContent = error.message || 'Payment verification could not complete. Please try again.';
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn-buy';
        retry.textContent = 'Retry Payment Verification';
        retry.onclick = function () {
            withButtonLoading(retry, 'Verifying...', function () {
                return verifyTutorialPayment(examId, reference);
            });
        };
        failure.appendChild(failureMessage);
        failure.appendChild(retry);
        failureDetails.appendChild(failure);
    }
}

// -------------------------

function openExamPackages(examId) {
    currentExam = dbExams.find(function (e) { return e.id === examId; });
    if (!currentExam) {return;}
    var titleEl = document.getElementById('pkg-exam-title');
    if (titleEl) {titleEl.innerText = currentExam.name + ' Packages';}
    var noteEl = document.getElementById('exam-note');
    if (noteEl) {noteEl.innerText = 'All ' + currentExam.name + ' questions and answers drop a day before the exam. Subscribe now to secure your PIN!';}
    var shareBtn = document.getElementById('share-link-btn');
    if (shareBtn) {
        shareBtn.onclick = function () {
            return withButtonLoading(shareBtn, 'Copying...', async function () {
                var url = window.location.origin + window.location.pathname + '?exam=' + encodeURIComponent(currentExam.slug);
                try {
                    await navigator.clipboard.writeText(url);
                    alert('Shareable link copied: ' + url);
                } catch (error) {
                    alert('Could not copy the shareable link. ' + (error.message || ''));
                }
            });
        };
    }
    var prices = currentExam.prices || {};
    document.getElementById('price-per-subject').innerText = prices.per_subject || 0;
    document.getElementById('price-per-dept').innerText = prices.per_dept || 0;
    document.getElementById('price-all-subjects').innerText = prices.all_subjects || 0;
    var allow = currentExam.allow || {};
    document.getElementById('pkg-per-subject').style.display = allow.per_subject ? 'block' : 'none';
    document.getElementById('pkg-per-dept').style.display = allow.per_dept ? 'block' : 'none';
    document.getElementById('pkg-all-subjects').style.display = allow.all_subjects ? 'block' : 'none';
    showPage('packages');
}

function openCheckout(packageType) {
    if (!currentExam) {return;}
    currentPackageType = packageType;
    var previewArea = document.getElementById('preview-image-area');
    var previewImg = document.getElementById('subject-preview-img');
    var subjectArea = document.getElementById('subject-selection-area');
    var subjectCheckboxes = document.getElementById('subject-checkboxes');
    var instructionText = document.getElementById('subject-instruction');
    var emailInput = document.getElementById('checkout-email');
    var titleEl = document.getElementById('checkout-title');
    if (titleEl) {titleEl.innerText = currentExam.name + ' — ' + packageType.replace('_', ' ');}
    if (emailInput && !emailInput.value) {
        try {
            emailInput.value = localStorage.getItem('sa_email') || '';
        } catch (_err) {
            // The email can still be entered manually.
        }
    }
    if (packageType === 'per_subject') {
        currentPrice = currentExam.prices.per_subject;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'block';
        previewImg.src = PLACEHOLDER_SELECT;
        if (instructionText) {instructionText.style.display = 'none';}
        var html = '';
        currentExam.subjects.forEach(function (sub) { html += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + escapeHtml(sub.name) + '"> ' + escapeHtml(sub.name) + '</label>'; });
        subjectCheckboxes.innerHTML = html;
        subjectCheckboxes.querySelectorAll('input[name="subject"]').forEach(function (cb) { cb.addEventListener('change', function () { updatePreviewAndLimit(cb, 1); }); });
    } else if (packageType === 'per_dept') {
        currentPrice = currentExam.prices.per_dept;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'none';
        var examNameUpper = currentExam.name.toUpperCase();
        var maxSubs = (examNameUpper.indexOf('JAMB') !== -1 || examNameUpper.indexOf('JUPEB') !== -1 || examNameUpper.indexOf('IJMB') !== -1 || examNameUpper.indexOf('POST UTME') !== -1) ? 4 : 9;
        if (instructionText) { instructionText.style.display = 'block'; instructionText.innerText = 'Please select the ' + maxSubs + ' subjects for your department.'; }
        var deptHtml = '';
        currentExam.subjects.forEach(function (sub) { deptHtml += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + escapeHtml(sub.name) + '"> ' + escapeHtml(sub.name) + '</label>'; });
        subjectCheckboxes.innerHTML = deptHtml;
        subjectCheckboxes.querySelectorAll('input[name="subject"]').forEach(function (cb) { cb.addEventListener('change', function () { limitSubjects(cb, maxSubs); }); });
    } else {
        currentPrice = currentExam.prices.all_subjects;
        subjectArea.style.display = 'none';
        previewArea.style.display = 'none';
        if (instructionText) {instructionText.style.display = 'none';}
    }
    document.getElementById('checkout-amount').innerText = '₦' + currentPrice;
    document.getElementById('checkout-modal').style.display = 'flex';
}

function updatePreviewAndLimit(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');
    if (max === 1) { checked.forEach(function (cb) { if (cb !== checkbox) {cb.checked = false;} }); }
    else if (checked.length > max) { checkbox.checked = false; alert('Max ' + max + ' subjects allowed.'); return; }
    if (checkbox.checked) {
        var subData = currentExam.subjects.find(function (s) { return s.name === checkbox.value; });
        document.getElementById('subject-preview-img').src = (subData && subData.thumbnail) || PLACEHOLDER_NO_IMAGE;
    } else {
        document.getElementById('subject-preview-img').src = PLACEHOLDER_SELECT;
    }
}

function limitSubjects(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) { checkbox.checked = false; alert('Max ' + max + ' subjects allowed.'); }
}

function closeModal(id) { var modal = document.getElementById(id); if (modal) {modal.style.display = 'none';} }

function payWithPaystack() {
    if (!currentExam) {return;}
    var selectedSubjects = [];
    if (currentPackageType !== 'all_subjects') {
        var checked = document.querySelectorAll('input[name="subject"]:checked');
        checked.forEach(function (cb) { selectedSubjects.push(cb.value); });
        if (selectedSubjects.length === 0) {return alert('Select at least one subject.');}
        if (currentPackageType === 'per_subject' && selectedSubjects.length !== 1) {return alert('Select exactly one subject.');}
    }
    var emailInput = document.getElementById('checkout-email');
    var email = emailInput ? emailInput.value.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { if (emailInput) {emailInput.focus();} return alert('Enter a valid email address.'); }
    var subjects = currentPackageType === 'all_subjects' ? currentExam.subjects.map(function (s) { return s.name; }) : selectedSubjects;
    var payButton = document.querySelector('.btn-paystack');
    var originalText = payButton ? payButton.innerText : 'Pay with Paystack';
    if (payButton) {
        payButton.disabled = true;
        payButton.setAttribute('aria-busy', 'true');
        payButton.innerText = 'Starting payment...';
    }
    if (!isPaystackReady()) {
        whenPaystackReady().then(function (ready) {
            if (payButton) { payButton.disabled = false; payButton.removeAttribute('aria-busy'); payButton.innerText = originalText; }
            if (!ready) { alert('Payment library could not load.'); } else { payWithPaystack(); }
        });
        return;
    }
    Promise.all([ getPaystackPublicKey(), fetch(API_URL + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examId: currentExam.id, packageType: currentPackageType, subjects: subjects, email: email, deviceId: getDeviceId() }) }).then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { if (!response.ok) {throw new Error(data.error || 'Checkout failed.');} return data; }); }) ])
        .then(function (results) {
            var publicKey = results[0]; var data = results[1];
            try {
                localStorage.setItem('sa_email', email);
                localStorage.setItem('sa_pending_payment', JSON.stringify({ reference: data.reference, examId: currentExam.id, examName: currentExam.name, packageType: currentPackageType, subjects: subjects, date: new Date().toISOString() }));
            } catch (_err) {
                // Payment can continue without local recovery details.
            }
            closeModal('checkout-modal');
            var amountKobo = Math.round(Number(data.amount || currentPrice) * 100);
            var popup = new PaystackPop();
            var resetPayButton = function () { if (payButton) { payButton.disabled = false; payButton.removeAttribute('aria-busy'); payButton.innerText = originalText; } };
            var callbacks = {
                onSuccess: function (transaction) {
                    if (payButton) {payButton.innerText = 'Verifying payment...';}
                    var reference = transaction && transaction.reference ? transaction.reference : data.reference;
                    claimPayment(reference).finally(resetPayButton);
                },
                onCancel: resetPayButton,
                onError: function (error) { resetPayButton(); alert((error && error.message) || 'Payment could not load.'); }
            };
            if (data.accessCode) { popup.resumeTransaction(data.accessCode, callbacks); }
            else { popup.newTransaction({ key: publicKey, email: email, amount: amountKobo, currency: data.currency || 'NGN', reference: data.reference, onSuccess: callbacks.onSuccess, onCancel: callbacks.onCancel, onError: callbacks.onError }); }
        })
        .catch(function (error) {
            if (payButton) {
                payButton.disabled = false;
                payButton.removeAttribute('aria-busy');
                payButton.innerText = originalText;
            }
            alert(error.message || 'Checkout failed.');
        });
}

function claimPayment(reference, attempt) {
    var tries = typeof attempt === 'number' ? attempt : 0;
    return fetch(API_URL + '/pins/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: reference, deviceId: getDeviceId() }) })
        .then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { if (!response.ok) { var error = new Error(data.error || 'Could not verify payment.'); error.status = response.status; throw error; } return data; }); })
        .then(function (data) {
            savePinLocally({ pin: data.pin, examId: data.examId, examName: data.examName, subjects: data.subjects, date: data.date, reference: data.reference });
            try {
                localStorage.removeItem('sa_pending_payment');
            } catch (_err) {
                // The verified PIN is already saved when storage is available.
            }
            showSuccessPin(data);
            return data;
        })
        .catch(function (error) { if (error.status === 402 && tries < 3) { return new Promise(function (resolve) { setTimeout(resolve, 2500); }).then(function () { return claimPayment(reference, tries + 1); }); } alert(error.message || 'Could not verify payment.'); });
}

function showSuccessPin(data) {
    var pinEl = document.getElementById('generated-pin'); if (pinEl) {pinEl.innerText = data.pin;}
    var verifyInput = document.getElementById('user-pin-input'); if (verifyInput) {verifyInput.value = data.pin;}
    var modal = document.getElementById('success-modal'); if (modal) {modal.style.display = 'flex';}
}

function handleReturnedPayment() {
    var params = new URLSearchParams(window.location.search);
    var reference = params.get('reference') || params.get('trxref');
    if (!reference) {return;}
    if (/^TUT_[A-F0-9]{16}$/.test(reference)) {
        showPage('tutorials');
        verifyTutorialPayment(null, reference);
        return;
    }
    try {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    } catch (_err) {
        // Payment verification does not depend on clearing the URL.
    }
    if (!/^SA_[A-F0-9]{16,64}$/i.test(reference)) { alert('Invalid payment reference.'); return; }
    claimPayment(reference, 0);
}

function verifyAndShowContent() {
    var inputPin = document.getElementById('user-pin-input').value.trim().toUpperCase();
    var errorMsg = document.getElementById('pin-error');
    var contentDisplay = document.getElementById('content-display');
    var answersDiv = document.getElementById('actual-answers');
    errorMsg.style.display = 'none'; contentDisplay.style.display = 'none';
    if (!inputPin) {return alert('Please enter a PIN.');}
    return fetch(API_URL + '/pins/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ pin: inputPin, deviceId: getDeviceId() }) })
        .then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { return { status: response.status, ok: response.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok) { errorMsg.innerText = result.data.error || 'Invalid PIN'; errorMsg.style.display = 'block'; return; }
            var pinData = result.data; var subjects = Array.isArray(pinData.subjects) ? pinData.subjects : []; var contentText = '';
            subjects.forEach(function (subject) { if (subject.content && subject.content.trim() !== '') { contentText += '--- ' + subject.name.toUpperCase() + ' ---\n'; contentText += subject.content + '\n\n'; } });
            answersDiv.innerHTML = '<pre style="font-family:monospace; white-space:pre-wrap; margin-bottom:20px; color:black; font-size:16px;">' + escapeHtml(contentText) + '</pre>';
            var hasImages = false;
            subjects.forEach(function (subject) { var images = Array.isArray(subject.qaImages) ? subject.qaImages : []; if (images.length === 0) {return;} hasImages = true; answersDiv.innerHTML += '<h4 style="margin-top:15px; color:var(--primary-blue);">' + escapeHtml(subject.name) + ' Images:</h4><div style="display:flex; flex-wrap:wrap; gap:10px;">'; images.forEach(function (imgUrl) { if (/^https?:\/\//i.test(String(imgUrl))) { answersDiv.innerHTML += '<img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(subject.name) + '" style="max-width:100%; border-radius:5px; border:1px solid #ddd;">'; } }); answersDiv.innerHTML += '</div>'; });
            if (contentText.trim() === '' && !hasImages) { answersDiv.innerHTML = '<p style="color:red;">No content found. Please contact support.</p>'; }
            contentDisplay.style.display = 'block';
        })
        .catch(function (_error) { errorMsg.innerText = 'Connection error. Please try again later.'; errorMsg.style.display = 'block'; contentDisplay.style.display = 'none'; });
}

var enquiryForm = document.getElementById('enquiryForm');
if (enquiryForm) {
    enquiryForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var submitButton = enquiryForm.querySelector('button[type="submit"]');
        if (submitButton.disabled) {return;}
        var originalSubmitText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.textContent = 'Sending...';
        var data = { name: document.getElementById('name').value, email: document.getElementById('email').value, phone: document.getElementById('phone').value, exam: document.getElementById('exam-select-enquiry').value, message: document.getElementById('message').value };
        fetch(API_URL + '/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
            .then(function (response) { return response.json().catch(function () { return {}; }).then(function (body) { if (!response.ok) {throw new Error(body.error || 'Failed to send message.');} return body; }); })
            .then(function () { alert('Message sent successfully!'); enquiryForm.reset(); })
            .catch(function (error) { alert(error.message || 'Failed to send message.'); })
            .finally(function () {
                submitButton.disabled = false;
                submitButton.removeAttribute('aria-busy');
                submitButton.textContent = originalSubmitText;
            });
    });
}

function checkSharedLink() {
    var urlParams = new URLSearchParams(window.location.search);
    var examSlug = urlParams.get('exam');
    if (examSlug) { var exam = dbExams.find(function (e) { return e.slug === examSlug; }); if (exam) { openExamPackages(exam.id); } }
}

function initSite() {
    displayDeviceId(); handleReturnedPayment();
    if (/^#news-\d+$/.test(window.location.hash)) { showPage('updates'); }
    if (document.getElementById('home-exam-grid')) { fetchExams().then(function () { checkSharedLink(); }); }
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initSite); } else { initSite(); }
