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

/**
 * Deletes a file from Cloudflare R2 given its public URL
 * @param {string} imageUrl - The full public URL of the image
 */
const deleteFromR2 = async (imageUrl) => {
    if (!imageUrl) return;

    try {
        const publicUrl = process.env.R2_PUBLIC_URL;
        if (!publicUrl || !imageUrl.startsWith(publicUrl)) {
            console.log("Image URL does not match R2_PUBLIC_URL, skipping deletion:", imageUrl);
            return;
        }

        const key = imageUrl.replace(`${publicUrl}/`, "");
        const bucketName = process.env.R2_BUCKET_NAME;

        console.log(`Deleting ${key} from ${bucketName}...`);
        const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        await r2Client.send(command);
        console.log("Successfully deleted from R2:", key);
    } catch (error) {
        console.error("Error deleting from R2:", error);
        // We don't throw here to avoid failing the main operation if cleanup fails
    }
};

module.exports = {
    uploadToR2,
    deleteFromR2,
};
