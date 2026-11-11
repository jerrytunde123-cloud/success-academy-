// Shared constants used by both the serverless API and the static frontend.
// Keep this file dependency-free.

const FULL_SUBJECT_LIST = [
    'English Language',
    'Mathematics',
    'Biology',
    'Chemistry',
    'Physics',
    'Economics',
    'Commerce',
    'Principles of Accounts',
    'Literature-in-English',
    'Government',
    'Geography',
    'History',
    'Christian Religious Studies',
    'Islamic Religious Studies',
    'Computer Studies',
    'Agricultural Science',
    'Hausa',
    'Igbo',
    'Yoruba',
    'French',
    'Arabic',
    'Home Economics',
    'Physical and Health Education',
    'Art',
    'Music',
    'Civic Education'
];

const DEFAULT_PRICES = {
    per_subject: 1000,
    per_dept: 5000,
    all_subjects: 8000
};

const DEFAULT_ALLOW = {
    per_subject: true,
    per_dept: true,
    all_subjects: true
};

const DEFAULT_EXAMS = [
    { id: '1', name: 'WAEC', slug: 'waec', logo: 'assets/waec-logo.png' },
    { id: '2', name: 'WAEC GCE', slug: 'waecgce', logo: 'assets/waec-logo.png' },
    { id: '3', name: 'NECO', slug: 'neco', logo: 'assets/neco-logo.png' },
    { id: '4', name: 'NECO GCE', slug: 'necogce', logo: 'assets/neco-logo.png' },
    { id: '5', name: 'JAMB', slug: 'jamb', logo: 'assets/jamb-logo.png' },
    { id: '6', name: 'POST UTME', slug: 'postutme', logo: 'assets/putme-logo.png' },
    { id: '7', name: 'JUPEB', slug: 'jupeb', logo: 'assets/jupeb-logo.png' },
    { id: '8', name: 'IJMB', slug: 'ijmb', logo: 'assets/ijmb-logo.png' },
    { id: '9', name: 'NABTEB', slug: 'nabteb', logo: 'assets/nabteb-logo.png' }
];

const PACKAGE_TYPES = ['per_subject', 'per_dept', 'all_subjects'];

const JAMB_LIKE_PATTERN = /JAMB|JUPEB|IJMB|POST UTME/i;
const SUBJECT_LIMIT_JAMB_LIKE = 4;
const SUBJECT_LIMIT_DEFAULT = 9;

const MAX_QA_IMAGES = 25;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SUBJECT_CONTENT_LENGTH = 500000;
const MAX_NEWS_IMAGES = 5;

// Matches the existing UI copy ("Enter 6-digit PIN") and the old PIN format.
const PIN_LENGTH = 6;
// 32 unambiguous characters: no I, O, 0 or 1.
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ADMIN_COOKIE_NAME = 'sa_admin';
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const RATE_LIMITS = {
    login: { limit: 5, windowSeconds: 15 * 60 },
    checkout: { limit: 20, windowSeconds: 60 * 60 },
    claim: { limit: 30, windowSeconds: 60 * 60 },
    verify: { limit: 20, windowSeconds: 10 * 60 },
    enquiry: { limit: 5, windowSeconds: 60 * 60 },
    visitor: { limit: 60, windowSeconds: 60 * 60 },
    upload: { limit: 100, windowSeconds: 60 * 60 }
};

function buildDefaultSubjects() {
    return FULL_SUBJECT_LIST.map(function (name) {
        return { name: name, content: '', thumbnail: '', qaImages: [] };
    });
}

module.exports = {
    FULL_SUBJECT_LIST,
    DEFAULT_PRICES,
    DEFAULT_ALLOW,
    DEFAULT_EXAMS,
    PACKAGE_TYPES,
    JAMB_LIKE_PATTERN,
    SUBJECT_LIMIT_JAMB_LIKE,
    SUBJECT_LIMIT_DEFAULT,
    MAX_QA_IMAGES,
    MAX_IMAGE_BYTES,
    MAX_SUBJECT_CONTENT_LENGTH,
    MAX_NEWS_IMAGES,
    PIN_LENGTH,
    PIN_ALPHABET,
    ADMIN_COOKIE_NAME,
    ADMIN_SESSION_TTL_SECONDS,
    RATE_LIMITS,
    buildDefaultSubjects
};
