const Doctor = require('../models/Docters');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

// helper: create transporter (expects SMTP env vars)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// POST /api/doctors
async function createDoctor(req, res) {
    try {
        const payload = req.body;
        // ensure status defaults to pending if not provided
        if (!payload.status) payload.status = 'pending';
        const doctor = await Doctor.create(payload);
        return res.status(201).json({ success: true, data: doctor });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
}

// PATCH /api/doctors/:id/status
async function updateStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, error: 'status required' });

        const doctor = await Doctor.findById(id);
        if (!doctor) return res.status(404).json({ success: false, error: 'Doctor not found' });

        const prevStatus = doctor.status;
        doctor.status = status;

        // when moving from pending -> inprogress, generate confirmation token and send email
        if (prevStatus === 'pending' && status === 'inprogress') {
            const token = crypto.randomBytes(32).toString('hex');
            doctor.confirmationToken = token;
            doctor.tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
            await doctor.save();

            // build confirmation link - prefer BACKEND_URL env var
            const backend = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
            const link = `${backend}/api/doctors/confirm?token=${token}&id=${doctor._id}`;

            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: doctor.email,
                subject: 'Doctor confirmation required',
                text: `Hello ${doctor.name || ''},\n\nPlease confirm your registration by clicking the link: ${link}\n\nIf you did not request this, ignore.`,
                html: `<p>Hello ${doctor.name || ''},</p><p>Please confirm your registration by clicking the link below:</p><p><a href="${link}">Confirm registration</a></p>`
            };

            await transporter.sendMail(mailOptions);
            return res.json({ success: true, message: 'Status updated and confirmation email sent' });
        }

        await doctor.save();
        return res.json({ success: true, data: doctor });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
}

// GET /api/doctors/confirm?token=...&id=...
async function confirmDoctor(req, res) {
    try {
        const { token, id } = req.query;
        if (!token || !id) return res.status(400).json({ success: false, error: 'token and id required' });

        const doctor = await Doctor.findById(id);
        if (!doctor) return res.status(404).json({ success: false, error: 'Doctor not found' });

        if (doctor.isConfirmed) return res.status(400).json({ success: false, error: 'Already confirmed' });
        if (!doctor.confirmationToken || doctor.confirmationToken !== token) {
            return res.status(400).json({ success: false, error: 'Invalid token' });
        }
        if (doctor.tokenExpiresAt && doctor.tokenExpiresAt < new Date()) {
            return res.status(400).json({ success: false, error: 'Token expired' });
        }

        // create user with role 'doctor'
        const randomPassword = crypto.randomBytes(8).toString('hex');
        const hashed = await bcrypt.hash(randomPassword, 10);

        const existingUser = await User.findOne({ email: doctor.email });
        if (existingUser) {
            // if user exists, just mark doctor confirmed
            doctor.isConfirmed = true;
            doctor.status = 'approved';
            doctor.confirmationToken = undefined;
            doctor.tokenExpiresAt = undefined;
            await doctor.save();
            return res.json({ success: true, message: 'Doctor confirmed. User already exists.' });
        }

        const user = await User.create({
            name: doctor.name || 'Doctor',
            email: doctor.email,
            password: hashed,
            role: 'doctor'
        });

        doctor.isConfirmed = true;
        doctor.status = 'approved';
        doctor.confirmationToken = undefined;
        doctor.tokenExpiresAt = undefined;
        await doctor.save();

        // optionally send credentials via email (not secure in production; prefer password set flow)
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: doctor.email,
            subject: 'Your doctor account has been created',
            text: `Hello ${doctor.name || ''},\n\nYour account has been created. Email: ${doctor.email}\nPassword: ${randomPassword}\n\nPlease log in and change your password.`,
            html: `<p>Hello ${doctor.name || ''},</p><p>Your account has been created.</p><p>Email: ${doctor.email}</p><p>Password: <b>${randomPassword}</b></p>`
        };
        await transporter.sendMail(mailOptions);

        return res.json({ success: true, message: 'Doctor confirmed and user created' });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
}

// GET /api/doctors
async function getDoctors(req, res) {
    try {
        // Find all approved, available, and non-deleted doctors.
        // Only return the fields needed for the booking modal.
        const doctors = await Doctor.find({
            status: 'approved',
            isAvailable: true,
            deleted: false
        }).select('name specialization department');
        return res.status(200).json({ success: true, data: doctors });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    createDoctor,
    updateStatus,
    confirmDoctor,
    getDoctors
};