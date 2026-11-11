// Success Academy — public site logic.
// The API lives on the same Vercel deployment under /api.

// Several functions below are called from inline onclick handlers in
// index.html, so ESLint cannot see the references.
/* eslint-disable no-unused-vars */

const API_URL = '/api';

var dbExams = [];
var currentExam = null;
var currentPackageType = null;
var currentPrice = 0;
var paystackPublicKey = null;
var paystackPublicKeyPromise = null;

const FALLBACK_PAYSTACK_PUBLIC_KEY = 'pk_live_456f9eef46c22ffa9c1f16d000f008926ca5c043';

// The Paystack inline script is loaded from a CDN, so it can still be loading
// (or blocked by a slow connection) when the buyer clicks Pay.
function whenPaystackReady(timeoutMs) {
    var limit = timeoutMs || 20000;

    function isReady() {
        return typeof PaystackPop !== 'undefined' && PaystackPop && typeof PaystackPop.setup === 'function';
    }

    if (isReady()) {
        return Promise.resolve(true);
    }

    return new Promise(function (resolve) {
        var started = Date.now();
        var timer = setInterval(function () {
            if (isReady()) {
                clearInterval(timer);
                resolve(true);
                return;
            }
            if (Date.now() - started > limit) {
                clearInterval(timer);
                resolve(false);
            }
        }, 200);
    });
}

function getPaystackPublicKey() {    if (paystackPublicKey) {
        return Promise.resolve(paystackPublicKey);
    }
    if (paystackPublicKeyPromise) {
        return paystackPublicKeyPromise;
    }
    paystackPublicKeyPromise = fetch(API_URL + '/config')
        .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) {
                    throw new Error(data.error || 'Could not load payment configuration.');
                }
                return data;
            });
        })
        .then(function (data) {
            paystackPublicKey = (data && data.paystackPublicKey) || FALLBACK_PAYSTACK_PUBLIC_KEY;
            return paystackPublicKey;
        })
        .catch(function () {
            paystackPublicKey = FALLBACK_PAYSTACK_PUBLIC_KEY;
            return paystackPublicKey;
        })
        .then(function (key) {
            paystackPublicKeyPromise = null;
            return key;
        });
    return paystackPublicKeyPromise;
}

const PLACEHOLDER_SELECT = 'https://placehold.co/300x150/001f5b/ffffff?text=Select+a+Subject';
const PLACEHOLDER_NO_IMAGE = 'https://placehold.co/300x150/001f5b/ffffff?text=No+Photo+Yet';

fetch(API_URL + '/visitors', { method: 'POST' }).catch(function () {});

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDeviceId() {
    var deviceId = null;
    try {
        deviceId = localStorage.getItem('sa_device_id');
    } catch (_err) {
        deviceId = null;
    }

    if (!deviceId || !/^DEV-[A-Z0-9_-]{4,60}$/.test(deviceId)) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        try {
            localStorage.setItem('sa_device_id', deviceId);
        } catch (_err) {
            // Storage can be unavailable in private browsing; the in-memory
            // value is still used for this page load.
        }
    }
    return deviceId;
}

function displayDeviceId() {
    var display = document.getElementById('user-device-id-display');
    if (display) {
        display.innerText = getDeviceId();
    }
}

function copyDeviceId() {
    navigator.clipboard.writeText(getDeviceId());
    alert('Device ID Copied!');
}

function savePinLocally(pinData) {
    try {
        var history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
        if (!history.some(function (p) { return p.pin === pinData.pin; })) {
            history.push(pinData);
            localStorage.setItem('sa_my_pins', JSON.stringify(history));
        }
    } catch (_err) {
        // Ignore unavailable storage.
    }
}

function loadMyPinHistory() {
    var container = document.getElementById('pin-history-container');
    if (!container) {
        return;
    }
    container.innerHTML = '';

    var history = [];
    try {
        history = JSON.parse(localStorage.getItem('sa_my_pins')) || [];
    } catch (_err) {
        history = [];
    }

    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666;">You have not purchased any PINs on this device yet.</p>';
        return;
    }

    history.slice().reverse().forEach(function (item) {
        var date = new Date(item.date).toLocaleDateString();
        var subjects = Array.isArray(item.subjects) ? item.subjects.join(', ') : '';
        var examName = item.examName || 'Unknown Exam';

        container.innerHTML +=
            '<div style="background:white; border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">' +
                '<div>' +
                    '<h4 style="color:var(--primary-blue); margin-bottom:5px;">' + escapeHtml(examName) + ' <span style="font-size:12px; color:#666;">(' + escapeHtml(date) + ')</span></h4>' +
                    '<p style="font-size:14px; color:#444;"><strong>Subjects:</strong> ' + escapeHtml(subjects) + '</p>' +
                '</div>' +
                '<div style="text-align:center;">' +
                    '<h3 style="color:green; letter-spacing:2px; margin-bottom:5px;">' + escapeHtml(item.pin) + '</h3>' +
                    '<button onclick="copyToClipboard(' + JSON.stringify(String(item.pin)).replace(/"/g, '&quot;') + ')" style="background:#25D366; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; font-size:12px;">Copy PIN</button>' +
                '</div>' +
            '</div>';
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert('PIN Copied: ' + text);
}

function showPage(pageId) {
    var mains = document.querySelectorAll('main');
    for (var i = 0; i < mains.length; i++) {
        mains[i].style.display = 'none';
    }
    var target = document.getElementById('page-' + pageId);
    if (target) {
        target.style.display = 'block';
    }

    if (pageId === 'verify') {
        displayDeviceId();
    }
    if (pageId === 'updates') {
        fetchNews();
    }
    if (pageId === 'history') {
        loadMyPinHistory();
    }
}

function fetchExams() {
    return fetch(API_URL + '/exams', { cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Could not load exams.');
            }
            return response.json();
        })
        .then(function (data) {
            dbExams = Array.isArray(data) ? data : [];
            renderExams();
        })
        .catch(function (error) {
            console.error('Error fetching exams:', error);
        });
}

function renderExams() {
    var grid = document.getElementById('home-exam-grid');
    if (!grid) {
        return;
    }
    grid.innerHTML = '';

    dbExams.forEach(function (exam) {
        var card = document.createElement('div');
        card.className = 'exam-card';
        card.onclick = function () {
            openExamPackages(exam.id);
        };

        var fallbackImg = 'https://placehold.co/60x60/001f5b/ffcc00?text=' + encodeURIComponent(exam.name.substring(0, 2));
        var img = document.createElement('img');
        img.src = exam.logo || fallbackImg;
        img.alt = exam.name;
        img.onerror = function () {
            this.onerror = null;
            this.src = fallbackImg;
        };

        var title = document.createElement('h3');
        title.style.marginTop = '10px';
        title.style.color = 'var(--primary-blue)';
        title.style.fontSize = '16px';
        title.textContent = exam.name;

        card.appendChild(img);
        card.appendChild(title);
        grid.appendChild(card);
    });
}

function linkify(value) {
    return escapeHtml(value).replace(/(https?:\/\/[^\s<]+)/g, function (url) {
        return '<a href="' + url + '" target="_blank" rel="noopener" style="color:#0088cc; text-decoration:underline; word-break:break-all;">' + url + '</a>';
    });
}

function fetchNews() {
    var container = document.getElementById('news-container');
    if (!container) {
        return;
    }
    container.innerHTML = 'Loading updates...';

    var hash = window.location.hash;
    var targetNewsId = null;
    if (hash && hash.indexOf('#news-') === 0) {
        targetNewsId = parseInt(hash.replace('#news-', ''), 10);
    }

    fetch(API_URL + '/news', { cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Could not load updates.');
            }
            return response.json();
        })
        .then(function (data) {
            container.innerHTML = '';
            if (!Array.isArray(data) || data.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666;">No updates yet. Check back later!</p>';
                return;
            }

            data.forEach(function (item) {
                var date = new Date(item.date).toLocaleDateString();
                var content = typeof item.content === 'string' ? item.content : '';
                var linkedContent = linkify(content);
                var shortSource = content.substring(0, 80);
                var shortContent = escapeHtml(shortSource) + (content.length > 80 ? '...' : '');

                var imagesHtml = '';
                if (Array.isArray(item.images) && item.images.length > 0) {
                    imagesHtml = '<div style="display:flex; flex-wrap:wrap; gap:10px; margin:15px 0;">';
                    item.images.forEach(function (img) {
                        if (/^https?:\/\//i.test(String(img))) {
                            imagesHtml += '<img src="' + escapeHtml(img) + '" alt="News image" style="max-width:100%; max-height:300px; border-radius:8px; border:1px solid #ddd;">';
                        }
                    });
                    imagesHtml += '</div>';
                }

                var isTarget = targetNewsId === item.id;
                var displayStyle = isTarget ? 'block' : 'none';

                container.innerHTML +=
                    '<div id="news-' + Number(item.id) + '" style="background:white; padding:20px; border-radius:10px; margin-bottom:20px; box-shadow:0 4px 10px rgba(0,0,0,0.05); border-left: 5px solid var(--accent-yellow);">' +
                        '<h3 style="color:var(--primary-blue); margin-bottom:5px;">' + escapeHtml(item.title) + '</h3>' +
                        '<p style="font-size:12px; color:#888; margin-bottom:15px;">' + escapeHtml(date) + '</p>' +
                        '<div id="short-' + Number(item.id) + '" style="display: ' + (isTarget ? 'none' : 'block') + ';">' +
                            '<p style="white-space:pre-wrap; color:#333; line-height:1.6;">' + shortContent + '</p>' +
                            '<button onclick="expandNews(' + Number(item.id) + ')" style="background:none; border:none; color:var(--primary-blue); font-weight:bold; cursor:pointer; padding:0; margin-top:10px;">Read More &rarr;</button>' +
                        '</div>' +
                        '<div id="full-' + Number(item.id) + '" style="display: ' + displayStyle + ';">' +
                            imagesHtml +
                            '<p style="white-space:pre-wrap; color:#333; line-height:1.6;">' + linkedContent + '</p>' +
                            '<button onclick="collapseNews(' + Number(item.id) + ')" style="background:none; border:none; color:red; font-weight:bold; cursor:pointer; padding:0; margin-top:10px;">Show Less &uarr;</button>' +
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
    if (shortEl) { shortEl.style.display = 'none'; }
    if (fullEl) { fullEl.style.display = 'block'; }
};

window.collapseNews = function (id) {
    var shortEl = document.getElementById('short-' + id);
    var fullEl = document.getElementById('full-' + id);
    if (fullEl) { fullEl.style.display = 'none'; }
    if (shortEl) { shortEl.style.display = 'block'; }
};

function openExamPackages(examId) {
    currentExam = dbExams.find(function (e) { return e.id === examId; });
    if (!currentExam) {
        return;
    }

    var titleEl = document.getElementById('pkg-exam-title');
    if (titleEl) { titleEl.innerText = currentExam.name + ' Packages'; }

    var noteEl = document.getElementById('exam-note');
    if (noteEl) {
        noteEl.innerText = 'All ' + currentExam.name + ' questions and answers drop a day before the exam. Subscribe now to secure your PIN!';
    }

    var shareBtn = document.getElementById('share-link-btn');
    if (shareBtn) {
        shareBtn.onclick = function () {
            var url = window.location.origin + window.location.pathname + '?exam=' + encodeURIComponent(currentExam.slug);
            navigator.clipboard.writeText(url);
            alert('Shareable link copied: ' + url);
        };
    }

    var prices = currentExam.prices || {};
    var pSubject = document.getElementById('price-per-subject');
    if (pSubject) { pSubject.innerText = prices.per_subject || 0; }

    var pDept = document.getElementById('price-per-dept');
    if (pDept) { pDept.innerText = prices.per_dept || 0; }

    var pAll = document.getElementById('price-all-subjects');
    if (pAll) { pAll.innerText = prices.all_subjects || 0; }

    var allow = currentExam.allow || {};
    var pkgSubject = document.getElementById('pkg-per-subject');
    if (pkgSubject) { pkgSubject.style.display = allow.per_subject ? 'block' : 'none'; }

    var pkgDept = document.getElementById('pkg-per-dept');
    if (pkgDept) { pkgDept.style.display = allow.per_dept ? 'block' : 'none'; }

    var pkgAll = document.getElementById('pkg-all-subjects');
    if (pkgAll) { pkgAll.style.display = allow.all_subjects ? 'block' : 'none'; }

    showPage('packages');
}

function openCheckout(packageType) {
    if (!currentExam) {
        return;
    }

    currentPackageType = packageType;
    var previewArea = document.getElementById('preview-image-area');
    var previewImg = document.getElementById('subject-preview-img');
    var subjectArea = document.getElementById('subject-selection-area');
    var subjectCheckboxes = document.getElementById('subject-checkboxes');
    var instructionText = document.getElementById('subject-instruction');
    var emailInput = document.getElementById('checkout-email');
    var titleEl = document.getElementById('checkout-title');

    if (titleEl) {
        titleEl.innerText = currentExam.name + ' — ' + packageType.replace('_', ' ');
    }

    if (emailInput && !emailInput.value) {
        try {
            emailInput.value = localStorage.getItem('sa_email') || '';
        } catch (_err) {
            // Ignore unavailable storage.
        }
    }

    if (packageType === 'per_subject') {
        currentPrice = currentExam.prices.per_subject;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'block';
        previewImg.src = PLACEHOLDER_SELECT;
        if (instructionText) { instructionText.style.display = 'none'; }

        var html = '';
        currentExam.subjects.forEach(function (sub) {
            html += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + escapeHtml(sub.name) + '"> ' + escapeHtml(sub.name) + '</label>';
        });
        subjectCheckboxes.innerHTML = html;
        subjectCheckboxes.querySelectorAll('input[name="subject"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                updatePreviewAndLimit(cb, 1);
            });
        });
    } else if (packageType === 'per_dept') {
        currentPrice = currentExam.prices.per_dept;
        subjectArea.style.display = 'block';
        previewArea.style.display = 'none';

        var examNameUpper = currentExam.name.toUpperCase();
        var maxSubs = (examNameUpper.indexOf('JAMB') !== -1 || examNameUpper.indexOf('JUPEB') !== -1 ||
            examNameUpper.indexOf('IJMB') !== -1 || examNameUpper.indexOf('POST UTME') !== -1) ? 4 : 9;

        if (instructionText) {
            instructionText.style.display = 'block';
            instructionText.innerText = 'Please select the ' + maxSubs + ' subjects for your department.';
        }

        var deptHtml = '';
        currentExam.subjects.forEach(function (sub) {
            deptHtml += '<label style="display:block; padding:5px;"><input type="checkbox" name="subject" value="' + escapeHtml(sub.name) + '"> ' + escapeHtml(sub.name) + '</label>';
        });
        subjectCheckboxes.innerHTML = deptHtml;
        subjectCheckboxes.querySelectorAll('input[name="subject"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                limitSubjects(cb, maxSubs);
            });
        });
    } else {
        currentPrice = currentExam.prices.all_subjects;
        subjectArea.style.display = 'none';
        previewArea.style.display = 'none';
        if (instructionText) { instructionText.style.display = 'none'; }
    }

    var payButton = document.querySelector('.btn-paystack');
    if (payButton) {
        payButton.disabled = false;
        payButton.innerText = 'Pay with Paystack';
    }

    document.getElementById('checkout-amount').innerText = '₦' + currentPrice;
    document.getElementById('checkout-modal').style.display = 'flex';
}

function updatePreviewAndLimit(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');

    if (max === 1) {
        checked.forEach(function (cb) {
            if (cb !== checkbox) { cb.checked = false; }
        });
    } else if (checked.length > max) {
        checkbox.checked = false;
        alert('Max ' + max + ' subjects allowed.');
        return;
    }

    if (checkbox.checked) {
        var subData = currentExam.subjects.find(function (s) { return s.name === checkbox.value; });
        document.getElementById('subject-preview-img').src = (subData && subData.thumbnail) || PLACEHOLDER_NO_IMAGE;
    } else {
        document.getElementById('subject-preview-img').src = PLACEHOLDER_SELECT;
    }
}

function limitSubjects(checkbox, max) {
    var checked = document.querySelectorAll('input[name="subject"]:checked');
    if (checked.length > max) {
        checkbox.checked = false;
        alert('Max ' + max + ' subjects allowed.');
    }
}

function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) { modal.style.display = 'none'; }
}

function payWithPaystack() {
    if (!currentExam) {
        return;
    }

    var selectedSubjects = [];
    if (currentPackageType !== 'all_subjects') {
        var checked = document.querySelectorAll('input[name="subject"]:checked');
        checked.forEach(function (cb) { selectedSubjects.push(cb.value); });
        if (selectedSubjects.length === 0) {
            return alert('Select at least one subject.');
        }
        if (currentPackageType === 'per_subject' && selectedSubjects.length !== 1) {
            return alert('Select exactly one subject.');
        }
    }

    var emailInput = document.getElementById('checkout-email');
    var email = emailInput ? emailInput.value.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        if (emailInput) { emailInput.focus(); }
        return alert('Enter a valid email address for your receipt.');
    }

    var subjects = currentPackageType === 'all_subjects'
        ? currentExam.subjects.map(function (s) { return s.name; })
        : selectedSubjects;

    var payButton = document.querySelector('.btn-paystack');
    var originalText = payButton ? payButton.innerText : 'Pay with Paystack';
    if (payButton) {
        payButton.disabled = true;
        payButton.innerText = 'Starting payment...';
    }

    if (typeof PaystackPop === 'undefined' || !PaystackPop || typeof PaystackPop.setup !== 'function') {
        // The CDN script may still be downloading: wait for it before giving up.
        whenPaystackReady().then(function (ready) {
            if (payButton) {
                payButton.disabled = false;
                payButton.innerText = originalText;
            }
            if (!ready) {
                alert('Payment library could not load. Please check your internet connection and try again.');
            } else {
                payWithPaystack();
            }
        });
        return;
    }

    Promise.all([
        getPaystackPublicKey(),
        fetch(API_URL + '/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: currentExam.id,
                packageType: currentPackageType,
                subjects: subjects,
                email: email,
                deviceId: getDeviceId()
            })
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) {
                    throw new Error(data.error || 'Checkout failed. Please try again.');
                }
                return data;
            });
        })
    ])
        .then(function (results) {
            var publicKey = results[0];
            var data = results[1];

            try {
                localStorage.setItem('sa_email', email);
                localStorage.setItem('sa_pending_payment', JSON.stringify({
                    reference: data.reference,
                    examId: currentExam.id,
                    examName: currentExam.name,
                    packageType: currentPackageType,
                    subjects: subjects,
                    date: new Date().toISOString()
                }));
            } catch (_err) {
                // Ignore unavailable storage.
            }

            closeModal('checkout-modal');

            var amountKobo = Math.round(Number(data.amount || currentPrice) * 100);
            var handler = PaystackPop.setup({
                key: publicKey,
                email: email,
                amount: amountKobo,
                currency: data.currency || 'NGN',
                ref: data.reference,
                callback: function () {
                    if (payButton) {
                        payButton.disabled = false;
                        payButton.innerText = originalText;
                    }
                    claimPayment(data.reference);
                },
                onClose: function () {
                    if (payButton) {
                        payButton.disabled = false;
                        payButton.innerText = originalText;
                    }
                }
            });
            handler.openIframe();
        })
        .catch(function (error) {
            if (payButton) {
                payButton.disabled = false;
                payButton.innerText = originalText;
            }
            alert(error.message || 'Checkout failed. Please try again.');
        });
}

function claimPayment(reference, attempt) {
    var tries = typeof attempt === 'number' ? attempt : 0;

    return fetch(API_URL + '/pins/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: reference, deviceId: getDeviceId() })
    })
        .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) {
                    var error = new Error(data.error || 'Could not verify payment.');
                    error.status = response.status;
                    throw error;
                }
                return data;
            });
        })
        .then(function (data) {
            savePinLocally({
                pin: data.pin,
                examId: data.examId,
                examName: data.examName,
                subjects: data.subjects,
                date: data.date,
                reference: data.reference
            });
            try {
                localStorage.removeItem('sa_pending_payment');
            } catch (_err) {
                // Ignore unavailable storage.
            }
            showSuccessPin(data);
            return data;
        })
        .catch(function (error) {
            if (error.status === 402 && tries < 3) {
                return new Promise(function (resolve) {
                    setTimeout(resolve, 2500);
                }).then(function () {
                    return claimPayment(reference, tries + 1);
                });
            }
            alert(error.message || 'Could not verify payment. If you have paid, please contact support with your reference.');
        });
}

function showSuccessPin(data) {
    var pinEl = document.getElementById('generated-pin');
    if (pinEl) { pinEl.innerText = data.pin; }

    var verifyInput = document.getElementById('user-pin-input');
    if (verifyInput) { verifyInput.value = data.pin; }

    var modal = document.getElementById('success-modal');
    if (modal) { modal.style.display = 'flex'; }
}

function handleReturnedPayment() {
    var params = new URLSearchParams(window.location.search);
    var reference = params.get('reference') || params.get('trxref');
    if (!reference) {
        return;
    }

    try {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    } catch (_err) {
        // Ignore browsers that block replaceState.
    }

    if (!/^SA_[A-F0-9]{16,64}$/i.test(reference)) {
        alert('Invalid payment reference.');
        return;
    }

    claimPayment(reference, 0);
}

function verifyAndShowContent() {
    var inputPin = document.getElementById('user-pin-input').value.trim().toUpperCase();
    var errorMsg = document.getElementById('pin-error');
    var contentDisplay = document.getElementById('content-display');
    var answersDiv = document.getElementById('actual-answers');

    errorMsg.style.display = 'none';
    contentDisplay.style.display = 'none';

    if (!inputPin) {
        return alert('Please enter a PIN.');
    }

    fetch(API_URL + '/pins/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ pin: inputPin, deviceId: getDeviceId() })
    })
        .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                return { status: response.status, ok: response.ok, data: data };
            });
        })
        .then(function (result) {
            if (!result.ok) {
                errorMsg.innerText = result.data.error || 'Invalid PIN';
                errorMsg.style.display = 'block';
                return;
            }

            var pinData = result.data;
            var subjects = Array.isArray(pinData.subjects) ? pinData.subjects : [];
            var contentText = '';

            subjects.forEach(function (subject) {
                if (subject.content && subject.content.trim() !== '') {
                    contentText += '--- ' + subject.name.toUpperCase() + ' ---\n';
                    contentText += subject.content + '\n\n';
                }
            });

            answersDiv.innerHTML = '<pre style="font-family:monospace; white-space:pre-wrap; margin-bottom:20px; color:black; font-size:16px;">' + escapeHtml(contentText) + '</pre>';

            var hasImages = false;
            subjects.forEach(function (subject) {
                var images = Array.isArray(subject.qaImages) ? subject.qaImages : [];
                if (images.length === 0) {
                    return;
                }
                hasImages = true;
                answersDiv.innerHTML += '<h4 style="margin-top:15px; color:var(--primary-blue);">' + escapeHtml(subject.name) + ' Images:</h4><div style="display:flex; flex-wrap:wrap; gap:10px;">';
                images.forEach(function (imgUrl) {
                    if (/^https?:\/\//i.test(String(imgUrl))) {
                        answersDiv.innerHTML += '<img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(subject.name) + ' answer" style="max-width:100%; border-radius:5px; border:1px solid #ddd;">';
                    }
                });
                answersDiv.innerHTML += '</div>';
            });

            if (contentText.trim() === '' && !hasImages) {
                answersDiv.innerHTML = '<p style="color:red;">No content found. Please contact support.</p>';
            }

            contentDisplay.style.display = 'block';
        })
        .catch(function (error) {
            console.error(error);
            errorMsg.innerText = 'Connection error. Please try again later.';
            errorMsg.style.display = 'block';
            contentDisplay.style.display = 'none';
        });
}

var enquiryForm = document.getElementById('enquiryForm');
if (enquiryForm) {
    enquiryForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            exam: document.getElementById('exam-select-enquiry').value,
            message: document.getElementById('message').value
        };

        fetch(API_URL + '/enquiries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (body) {
                    if (!response.ok) {
                        throw new Error(body.error || 'Failed to send message.');
                    }
                    return body;
                });
            })
            .then(function () {
                alert('Message sent successfully!');
                enquiryForm.reset();
            })
            .catch(function (error) {
                alert(error.message || 'Failed to send message.');
            });
    });
}

function checkSharedLink() {
    var urlParams = new URLSearchParams(window.location.search);
    var examSlug = urlParams.get('exam');
    if (examSlug) {
        var exam = dbExams.find(function (e) { return e.slug === examSlug; });
        if (exam) {
            openExamPackages(exam.id);
        }
    }
}

function initSite() {
    displayDeviceId();
    handleReturnedPayment();

    if (/^#news-\d+$/.test(window.location.hash)) {
        showPage('updates');
    }

    if (document.getElementById('home-exam-grid')) {
        fetchExams().then(function () {
            checkSharedLink();
        });
    }
}

// Do not wait for the window "load" event: a slow third-party asset (hero
// image, font CDN) would delay the exam list for everyone.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSite);
} else {
    initSite();
}
