import { turso } from '../lib/turso.js';
import { verifyPaystack } from '../lib/paystack.js'; // Assuming you have a helper for this

export default async function handler(req, res) {
    // GET: Fetch tutorial details for a specific exam
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

    // POST: Verify payment and return the link
    if (req.method === 'POST') {
        const { examId, reference, deviceId } = req.body;
        
        if (!reference || !examId) return res.status(400).json({ error: "Missing data" });

        try {
            // 1. Verify Paystack Payment
            const payment = await verifyPaystack(reference);
            if (!payment.status || payment.data.status !== 'success') {
                return res.status(400).json({ error: "Payment not successful" });
            }

            // 2. Check if the amount paid matches the tutorial price
            const exam = await turso.execute({
                sql: "SELECT tutorialPrice, tutorialLink FROM exams WHERE id = ?",
                args: [examId]
            });
            
            const expectedAmount = exam.rows[0].tutorialPrice * 100; // Paystack uses kobo
            if (payment.data.amount < expectedAmount) {
                return res.status(400).json({ error: "Insufficient payment amount" });
            }

            // 3. Return the link (You can save this purchase to the DB if you want)
            return res.status(200).json({ success: true, link: exam.rows[0].tutorialLink });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Verification failed" });
        }
    }
    
    return res.status(405).json({ error: "Method not allowed" });
}
