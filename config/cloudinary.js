const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { Readable } = require("stream");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const memoryStorage = multer.memoryStorage();

function makeImageUpload() {
  return multer({ storage: memoryStorage, limits: { fileSize: 5 * 1024 * 1024 } });
}

function makeFileUpload() {
  return multer({ storage: memoryStorage, limits: { fileSize: 20 * 1024 * 1024 } });
}

function uploadToCloudinary(buffer, folder, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, ...options },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function deleteFromCloudinary(url, resource_type = "image") {
  if (!url || !url.includes("cloudinary.com")) return;
  try {
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");
    let pathParts = parts.slice(uploadIndex + 1);
    if (/^v\d+$/.test(pathParts[0])) pathParts = pathParts.slice(1);
    const publicId = pathParts.join("/").replace(/\.[^/.]+$/, "");
    await cloudinary.uploader.destroy(publicId, { resource_type });
  } catch (e) {
    console.error("Cloudinary delete error:", e.message);
  }
}

function signCloudinaryUrl(url) {
  if (!url || !url.includes("cloudinary.com")) return url;
  try {
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");
    let pathParts = parts.slice(uploadIndex + 1);
    if (/^v\d+$/.test(pathParts[0])) pathParts = pathParts.slice(1);
    const publicId = pathParts.join("/").replace(/\.[^/.]+$/, "");
    return cloudinary.url(publicId, { sign_url: true, type: "authenticated" });
  } catch {
    return url;
  }
}

module.exports = { cloudinary, makeImageUpload, makeFileUpload, uploadToCloudinary, deleteFromCloudinary, signCloudinaryUrl };
