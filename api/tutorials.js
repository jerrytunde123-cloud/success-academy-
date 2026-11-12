const { turso } = require('../lib/db');
const { verifyPaystack } = require('../lib/paystack'); // Ensure this is the correct path

module.exports = async function (req, res) {
    // Enable CORS just in case
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const { examId } = req.query;
        try {
            const result = await turso.execute({
                sql: "SELECT id, name, tutorialPrice, tutorialBenefits FROM exams WHERE id = ?",
                args: [examId]
            });
            if (result.rows.length === 0) return res.status(404).json({ error: "Exam not found" });
            return res.status(200).json(result.rows[0]);
        } catch (error) {
            return res.status(500).json({ error: "Database error" });
        }
    }

    if (req.method === 'POST') {
        const { examId, reference } = req.body;
        if (!reference || !examId) return res.status(400).json({ error: "Missing data" });

        try {
            const payment = await verifyPaystack(reference);
            if (!payment.status || payment.data.status !== 'success') {
                return res.status(400).json({ error: "Payment not successful" });
            }

            const exam = await turso.execute({
                sql: "SELECT tutorialPrice, tutorialLink FROM exams WHERE id = ?",
                args: [examId]
            });
            
            const expectedAmount = exam.rows[0].tutorialPrice * 100; 
            if (payment.data.amount < expectedAmount) {
                return res.status(400).json({ error: "Insufficient payment amount" });
            }

            return res.status(200).json({ success: true, link: exam.rows[0].tutorialLink });
        } catch (error) {
            console.error("Verification Error:", error);
            return res.status(500).json({ error: "Verification failed" });
        }
    }
    return res.status(405).json({ error: "Method not allowed" });
};
