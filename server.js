const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── Database Connection ───────────────────────────────────────────────────────
const db = mysql.createConnection({
    host: "127.0.0.1",
    user: "root",
    password: "root", 
    database: "university_ticketing"
});

db.connect(err => {
    if (err) {
        console.log("❌ DB Error: " + err.message);
    } else {
        console.log("✅ HNU Bridge Server Connected Successfully");
        initDB();
    }
});

// إنشاء الجداول تلقائياً لو مش موجودة
function initDB() {
    db.query(`
        CREATE TABLE IF NOT EXISTS ticket (
            ticket_id     INT AUTO_INCREMENT PRIMARY KEY,
            student_id    INT NOT NULL DEFAULT 1001,
            title         VARCHAR(500) NOT NULL,
            status        ENUM('Open','Processed','Pending') DEFAULT 'Open',
            priority      ENUM('Low','Medium','High') DEFAULT 'Low',
            admin_comment TEXT DEFAULT NULL,
            escalation_reason VARCHAR(1000) DEFAULT NULL,
            created_at    DATETIME DEFAULT NOW(),
            updated_at    DATETIME DEFAULT NOW() ON UPDATE NOW()
        )
    `, err => { if (err) console.log("ticket table error:", err.message); });

    db.query(`
        CREATE TABLE IF NOT EXISTS escalation (
            escalation_id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id     INT NOT NULL,
            level         VARCHAR(100) NOT NULL,
            reason        TEXT NOT NULL,
            escalated_at  DATETIME DEFAULT NOW(),
            FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id) ON DELETE CASCADE
        )
    `, err => { if (err) console.log("escalation table error:", err.message); });
}

// ─── Serve HTML pages ──────────────────────────────────────────────────────────
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, 'student.html')));
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'adminpanel.html')));

// ─── Student APIs ──────────────────────────────────────────────────────────────
app.get('/api/my-tickets', (req, res) => {
    db.query("SELECT * FROM ticket WHERE student_id = 1001 ORDER BY ticket_id DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/tickets', (req, res) => {
    const { title } = req.body;
    db.query("INSERT INTO ticket (title, student_id) VALUES (?, 1001)", [title], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: result.insertId });
    });
});

// ─── Admin APIs ────────────────────────────────────────────────────────────────

// جلب كل التذاكر للـ Admin
app.get('/api/admin/tickets', (req, res) => {
    db.query("SELECT * FROM ticket ORDER BY ticket_id DESC", (err, results) => {
        if (err) {
            console.error("❌ SQL Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// تحديث التذكرة (Status/Priority/Comment)
app.put('/api/tickets/:id', (req, res) => {
    const { status, priority, admin_comment } = req.body;
    const { id } = req.params;
    db.query(
        "UPDATE ticket SET status = ?, priority = ?, admin_comment = ?, updated_at = NOW() WHERE ticket_id = ?",
        [status, priority, admin_comment, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// تصعيد التذكرة (Escalation)
app.post('/api/tickets/:id/escalate', (req, res) => {
    const { reason, level } = req.body;
    const { id } = req.params;

    const sqlEsc = "INSERT INTO escalation (ticket_id, priority, reason, escalated_at) VALUES (?, ?, ?, NOW())";
    
    db.query(sqlEsc, [id, level || 'Department Head', reason], (err) => {
        if (err) {
            console.error("❌ SQL Error in Escalation Table:", err.message);
            return res.status(500).json({ error: err.message });
        }

        const sqlUpdate = "UPDATE ticket SET status = 'Pending' WHERE ticket_id = ?";
        db.query(sqlUpdate, [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            console.log(`✅ Ticket #${id} Escalated Successfully!`);
            res.json({ success: true });
        });
    });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
    console.log("👉 Admin: http://localhost:3000/admin");
    console.log("👉 Student: http://localhost:3000/student");
});