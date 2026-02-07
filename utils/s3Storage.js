const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
require("dotenv").config();

const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

/**
 * Uploads a file to Cloudflare R2
 * @param {Buffer} fileBuffer - The file content
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
const uploadToR2 = async (fileBuffer, fileName, mimeType) => {
    const fileExtension = fileName.split(".").pop();
    const uniqueFileName = `${crypto.randomBytes(16).toString("hex")}.${fileExtension}`;

    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: uniqueFileName,
        Body: fileBuffer,
        ContentType: mimeType,
    });

    try {
        await r2Client.send(command);
        // Return the public URL if configured, otherwise the key
        return publicUrl ? `${publicUrl}/${uniqueFileName}` : uniqueFileName;
    } catch (error) {
        console.error("Error uploading to R2:", error);
        throw new Error("Failed to upload image to storage");
    }
};

module.exports = {
    uploadToR2,
};
