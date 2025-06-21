const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Enable CORS (for Unity WebGL or standalone builds)
app.use(cors());

// ✅ Serve static uploaded files from /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Ensure the uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ✅ Multer config for saving JSON files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed!'));
        }
    }
});

// ✅ Home page route
app.get('/', (req, res) => {
    res.send(`
        <h2>📁 Unsity Upload Server is Running</h2>
        <p>Send a POST request to <code>/upload</code> with a .json file using the form field named <code>file</code>.</p>
    `);
});

// ✅ Upload route
app.post('/upload', upload.single('file'), (req, res) => {
    console.log("🔔 POST /upload received");

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({
        message: '✅ File uploaded successfully!',
        fileUrl: fileUrl
    });
});

// ✅ Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
});

// ✅ Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
