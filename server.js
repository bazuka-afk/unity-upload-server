const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for Unity and browsers
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve uploaded files publicly
const uploadDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadDir));

// Ensure upload folder exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const displayName = req.body.name || "Unknown";
        const safeName = displayName.replace(/[^a-z0-9_-]/gi, '_');
        const filename = `${Date.now()}-${safeName}.json`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json') cb(null, true);
        else cb(new Error('Only JSON files allowed'));
    }
});

// Home Page: File browser
app.get('/', (req, res) => {
    const files = fs.readdirSync(uploadDir)
        .filter(f => f.endsWith('.json'))
        .map(filename => {
            const [timestamp, ...nameParts] = filename.replace('.json', '').split('-');
            const uploader = nameParts.join('-') || "Unknown";
            return {
                filename,
                uploader,
                url: `/uploads/${filename}`
            };
        });

    let html = `
        <h2>📁 Uploaded Files</h2>
        <table border="1" cellpadding="6" cellspacing="0">
        <tr><th>Uploader</th><th>File</th><th>Actions</th></tr>
    `;

    for (const file of files) {
        html += `
        <tr>
            <td>${file.uploader}</td>
            <td><a href="${file.url}" target="_blank">${file.filename}</a></td>
            <td>
                <form method="POST" action="/delete" style="display:inline">
                    <input type="hidden" name="filename" value="${file.filename}" />
                    <button type="submit">❌ Delete</button>
                </form>
            </td>
        </tr>
        `;
    }

    html += `</table>
        <p>🧹 Delete files regularly to stay under Render’s 500MB limit.</p>
    `;

    res.send(html);
});

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    console.log(`📥 Upload from: ${req.body.name}`);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ message: '✅ Upload complete', fileUrl });
});

// Delete endpoint
app.post('/delete', (req, res) => {
    const filename = req.body.filename;
    const filePath = path.join(uploadDir, filename);

    if (!filename || !fs.existsSync(filePath)) {
        return res.status(404).send('❌ File not found.');
    }

    fs.unlinkSync(filePath);
    console.log(`🗑️ Deleted: ${filename}`);
    res.redirect('/');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
