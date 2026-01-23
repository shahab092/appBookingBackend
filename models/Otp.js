const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        otp: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // TTL index: document will be deleted at expiresAt
        },
    },
    {
        timestamps: true,
    }
);

const Otp = mongoose.models.Otp || mongoose.model("Otp", otpSchema);

module.exports = Otp;
