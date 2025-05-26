// config/cloudinary.js

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Set up Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "uploads",
    allowed_formats: ["jpg", "jpeg", "png", "gif","webp","avif", "svg", "bmp", "tiff", "ico", "heic"],
    transformation: [{ width: 1000, height: 1000, crop: "limit", quality: "auto" }],
  },
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

module.exports = {
  cloudinary,
  upload,
};