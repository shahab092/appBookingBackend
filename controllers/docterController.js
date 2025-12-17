const Doctor = require('../models/Docters');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require('../utils/ApiResponse');
require('dotenv').config();

// Create a SINGLE transporter instance
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test transporter on startup
transporter.verify(function (error, success) {
  if (error) {
    console.log('❌ SMTP Connection Error:', error.message);
    console.log('🔄 Email will fail. Check your Gmail app password.');
  } else {
    console.log('✅ SMTP Server is ready to take messages');
    console.log('📧 Using:', process.env.SMTP_USER || 'dev.shahab92@gmail.com');
  }
});

const registerDoctor = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, address, doctorProfile } = req.body;

    // 1️⃣ Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, and password are required",
      });
    }

    if (!doctorProfile || !doctorProfile.licenseNumber) {
      return res.status(400).json({
        success: false,
        message: "doctorProfile with licenseNumber is required",
      });
    }

    // 2️⃣ Check if doctor already exists
    const existingDoctor = await User.findOne({ email });
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // ✅ 3️⃣ Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('🔐 Password hashed successfully');

    // 4️⃣ Create doctor with hashed password
    const newDoctor = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword, // ✅ Store hashed password
      role: "doctor",
      address,
      doctorProfile,
      status: "pending",
    });

    // 5️⃣ Return success response (without password)
    res.status(201).json({
      success: true,
      message: "Doctor registered successfully",
      data: {
        id: newDoctor._id,
        fullName: newDoctor.fullName,
        email: newDoctor.email,
        doctorProfile: newDoctor.doctorProfile,
      },
    });
  } catch (error) {
    console.error('❌ Doctor registration error:', error);
    next(error);
  }
};

// PATCH /api/doctors/:id/status
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "status required",
      });
    }

    const doctor = await User.findById(id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: "Doctor not found",
      });
    }

    // ✅ EMAIL EXISTENCE CHECK
    if (!doctor.email) {
      return res.status(400).json({
        success: false,
        error: "Doctor email not found",
      });
    }

    // ✅ EMAIL FORMAT VALIDATION
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(doctor.email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email address",
      });
    }

    const prevStatus = doctor.status;
    doctor.status = status;

    // when moving from pending -> inprogress, generate JWT confirmation token and send email
    if (status.toLowerCase() === "inprogress") {
      // Generate JWT token for doctor confirmation
      const token = jwt.sign(
        {
          doctorId: doctor._id.toString(),
          email: doctor.email,
          purpose: 'doctor_confirmation',
          timestamp: Date.now()
        },
        process.env.DOCTOR_CONFIRMATION_SECRET,
        { expiresIn: '24h' }
      );

      // Keep backward compatibility - also store token hash in DB
      // This helps if we need to revoke tokens or track usage
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      doctor.doctorConfirmationTokenHash = tokenHash;
      doctor.doctorTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // Save the status change
      await doctor.save();

      const backend = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
      
      // ✅ Use JWT token in URL
      const encodedToken = encodeURIComponent(token);
      const link = `${backend}/api/doctor/confirm?token=${encodedToken}`;

      console.log('🔗 === DOCTOR CONFIRMATION EMAIL ===');
      console.log('📝 JWT Token generated (first 50 chars):', token.substring(0, 50) + '...');
      console.log('🔐 Token Hash (stored in DB):', tokenHash.substring(0, 20) + '...');
      console.log('📧 Doctor email:', doctor.email);
      console.log('🆔 Doctor ID:', doctor._id);
      console.log('🔗 Generated link:', link);
      console.log('⏰ Expires at:', doctor.doctorTokenExpiresAt);
      console.log('🏁 =================================');

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'dev.shahab92@gmail.com',
        to: doctor.email,
        subject: "Doctor Account Approval - Action Required",
        text: `Hello ${doctor.firstName || ""},\n\nYour doctor registration has been reviewed and approved!\n\nPlease confirm your registration by clicking the link:\n${link}\n\nThis link is valid for 24 hours.\n\nAfter confirmation, you can login with your credentials.\n\nIf you did not request this, please ignore this email.`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
              <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
                  .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                  .link-box { background: #fff; border: 1px solid #ddd; padding: 10px; border-radius: 5px; margin: 15px 0; word-break: break-all; font-family: monospace; font-size: 12px; }
              </style>
          </head>
          <body>
              <div class="container">
                  <div class="header">
                      <h1>Doctor Account Approval</h1>
                  </div>
                  <div class="content">
                      <h2>Hello Dr. ${doctor.firstName || ""} ${doctor.lastName || ""},</h2>
                      <p>We are pleased to inform you that your doctor registration has been reviewed and <strong>approved</strong>!</p>
                      
                      <p>To activate your account, please click the button below:</p>
                      
                      <a href="${link}" class="button">Confirm & Activate Account</a>
                      
                      <p>Or copy this link:</p>
                      <div class="link-box">${link}</div>
                      
                      <p><strong>Important Notes:</strong></p>
                      <ul>
                          <li>This link is valid for 24 hours</li>
                          <li>After confirmation, your account status will change to <strong>"approved"</strong></li>
                          <li>You can then login using your registered email and password</li>
                      </ul>
                      
                      <p>If you have any questions, please contact our support team.</p>
                      
                      <div class="footer">
                          <p>This is an automated message. Please do not reply to this email.</p>
                          <p>&copy; ${new Date().getFullYear()} Medical Portal. All rights reserved.</p>
                      </div>
                  </div>
              </div>
          </body>
          </html>
        `,
      };

      try {
        // Try to send email
        await transporter.sendMail(mailOptions);

        return res.json({
          success: true,
          message: "Status updated and confirmation email sent successfully",
          data: doctor,
          emailSent: true,
          // Return minimal info for debugging
          confirmationLink: `${backend}/api/doctor/confirm?token=[JWT_TOKEN]`
        });
      } catch (emailError) {
        // Status was updated, but email failed
        console.error("Email sending failed:", emailError.message);

        return res.json({
          success: true,
          warning: "Email delivery failed",
          message: "Status updated to inprogress, but confirmation email could not be sent. Please provide this link to the doctor manually:",
          data: doctor,
          emailSent: false,
          confirmationLink: link
        });
      }
    }

    // For other status updates (not inprogress)
    await doctor.save();

    return res.json({
      success: true,
      data: doctor,
      emailSent: null // No email was attempted
    });
  } catch (err) {
    console.error("Update status error:", err);
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}

// GET /api/doctors/confirm?token=...
async function confirmDoctor(req, res) {
  try {
    console.log('🔍 === DOCTOR CONFIRMATION REQUEST ===');
    console.log('📝 Full URL:', req.originalUrl);
    console.log('📋 Query params:', req.query);
    
    const { token } = req.query;
    
    if (!token) {
      console.log('❌ No token provided');
      return sendErrorPage(res, 'Invalid Confirmation Link', 'The confirmation link is incomplete or missing token.');
    }
    
    console.log('🔑 Token received (first 50 chars):', token.substring(0, 50) + '...');
    
    let decoded;
    try {
      // Verify JWT token
      decoded = jwt.verify(token, process.env.DOCTOR_CONFIRMATION_SECRET);
      console.log('✅ JWT verified successfully');
      console.log('📋 JWT payload:', {
        doctorId: decoded.doctorId,
        email: decoded.email,
        purpose: decoded.purpose,
        exp: new Date(decoded.exp * 1000),
        iat: new Date(decoded.iat * 1000)
      });
    } catch (jwtError) {
      console.log('❌ JWT verification failed:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return sendErrorPage(res, 'Link Expired', 'This confirmation link has expired. Please request a new one from the administrator.');
      } else if (jwtError.name === 'JsonWebTokenError') {
        return sendErrorPage(res, 'Invalid Link', 'The confirmation link is invalid or corrupted.');
      } else {
        return sendErrorPage(res, 'Invalid Link', 'The confirmation link could not be verified.');
      }
    }
    
    // Verify token purpose
    if (decoded.purpose !== 'doctor_confirmation') {
      console.log('❌ Invalid token purpose:', decoded.purpose);
      return sendErrorPage(res, 'Invalid Link', 'This link is not for doctor confirmation.');
    }
    
    const doctor = await User.findById(decoded.doctorId);
    
    if (!doctor) {
      console.log('❌ Doctor not found with ID:', decoded.doctorId);
      return sendErrorPage(res, 'Doctor Not Found', 'The doctor account associated with this link could not be found.');
    }
    
    console.log('✅ Doctor found:', {
      email: doctor.email,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      status: doctor.status,
      doctorConfirmationTokenHash: doctor.doctorConfirmationTokenHash ? 'Exists' : 'Missing'
    });

    // Check if already confirmed
    if (doctor.status === 'active' || doctor.status === 'approved') {
      console.log('ℹ️ Doctor already has status:', doctor.status);
      return sendAlreadyConfirmedPage(res, doctor);
    }
    
    // Check if doctor is in correct status
    if (doctor.status !== 'inprogress') {
      console.log('❌ Doctor not in inprogress status:', doctor.status);
      return sendErrorPage(res, 'Invalid Request', `Doctor account is in "${doctor.status}" status and cannot be confirmed.`);
    }
    
    // Optional: Verify token hash for additional security (backward compatibility)
    if (doctor.doctorConfirmationTokenHash) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      if (doctor.doctorConfirmationTokenHash !== tokenHash) {
        console.log('❌ Token hash mismatch');
        console.log('   URL Token hash:', tokenHash.substring(0, 20) + '...');
        console.log('   DB Token hash:', doctor.doctorConfirmationTokenHash.substring(0, 20) + '...');
        return sendErrorPage(res, 'Invalid Link', 'This confirmation link has already been used or is invalid.');
      }
    }
    
    // Check token expiration from DB (backward compatibility)
    if (doctor.doctorTokenExpiresAt && doctor.doctorTokenExpiresAt < new Date()) {
      console.log('❌ Token expired in DB:', doctor.doctorTokenExpiresAt);
      return sendErrorPage(res, 'Link Expired', 'This confirmation link has expired. Please request a new one.');
    }

    console.log('✅ All validations passed!');
    
    // Update doctor status
    doctor.status = 'approved';
    
    // Clear token data
    doctor.doctorConfirmationTokenHash = undefined;
    doctor.doctorTokenExpiresAt = undefined;
    doctor.confirmationToken = undefined;
    doctor.tokenExpiresAt = undefined;
    
    // Set confirmation flags
    doctor.isDoctorConfirmed = true;
    doctor.doctorConfirmedAt = new Date();

    await doctor.save();
    
    console.log('🎉 Doctor confirmed successfully!');
    console.log('📊 New status:', doctor.status);
    console.log('🏁 =================================');

    // Send welcome email
    try {
      const welcomeMailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: doctor.email,
        subject: "🎉 Welcome to Medical Portal - Your Account is Now Active!",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
              <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
                  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                  .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                  .credentials { background: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
                  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
              </style>
          </head>
          <body>
              <div class="header">
                  <h1>Welcome to Medical Portal!</h1>
              </div>
              <div class="content">
                  <h2>Hello Dr. ${doctor.firstName} ${doctor.lastName},</h2>
                  
                  <p>We are delighted to inform you that your doctor account has been <strong>successfully confirmed and activated!</strong> 🎉</p>
                  
                  <div class="credentials">
                      <p><strong>Account Details:</strong></p>
                      <p>📧 Email: <strong>${doctor.email}</strong></p>
                      <p>✅ Status: <strong style="color: #4CAF50;">APPROVED</strong></p>
                      <p>📅 Activated: ${new Date().toLocaleDateString()}</p>
                  </div>
                  
                  <p><strong>To access your account:</strong></p>
                  <ol>
                      <li>Go to the login page</li>
                      <li>Enter your email: <strong>${doctor.email}</strong></li>
                      <li>Enter your password (the one you created during registration)</li>
                      <li>Click "Login" to access your dashboard</li>
                  </ol>
                  
                  <p style="text-align: center;">
                      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">
                          🔓 Go to Login Page
                      </a>
                  </p>
                  
                  <p>You now have access to:</p>
                  <ul>
                      <li>✅ Patient Appointment Management</li>
                      <li>✅ Medical Records Access</li>
                      <li>✅ Prescription Management</li>
                      <li>✅ Analytics Dashboard</li>
                  </ul>
                  
                  <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                  
                  <div class="footer">
                      <p>Best regards,<br>The Medical Portal Team</p>
                      <p>This is an automated message. Please do not reply to this email.</p>
                  </div>
              </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(welcomeMailOptions);
      console.log('✅ Welcome email sent to:', doctor.email);
    } catch (emailError) {
      console.log("⚠️ Welcome email failed:", emailError.message);
    }

    // Return success HTML page
    return sendSuccessPage(res, doctor);

  } catch (err) {
    console.error('💥 Confirm doctor error:', err);
    console.error('📋 Error details:', err.stack);
    
    return sendErrorPage(res, 'Server Error', `An unexpected error occurred: ${err.message}`);
  }
}

// Helper function to send error pages
function sendErrorPage(res, title, message) {
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Medical Portal</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gradient-to-br from-red-50 to-pink-100 min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>
            </div>
            
            <h1 class="text-3xl font-bold text-gray-800 mb-4">${title}</h1>
            
            <div class="text-gray-600 mb-6">
                <p>${message}</p>
            </div>
            
            <div class="space-y-3">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/support" 
                   class="block w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition">
                    Contact Support
                </a>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" 
                   class="block w-full border border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition">
                    Go to Login
                </a>
            </div>
        </div>
    </body>
    </html>
  `);
}

// Helper function for already confirmed page
function sendAlreadyConfirmedPage(res, doctor) {
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Already Confirmed - Medical Portal</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gradient-to-br from-green-50 to-emerald-100 min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg class="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            
            <h1 class="text-3xl font-bold text-gray-800 mb-4">Account Already Active</h1>
            
            <div class="text-center mb-6">
                <h2 class="text-xl font-bold text-gray-800">Dr. ${doctor.firstName} ${doctor.lastName}</h2>
                <p class="text-gray-600 mt-2">${doctor.email}</p>
            </div>
            
            <div class="bg-green-100 text-green-800 font-bold py-2 px-4 rounded-full inline-block mb-6">
                STATUS: ${doctor.status.toUpperCase()}
            </div>
            
            <div class="text-gray-600 mb-6">
                <p>Your account is already active and confirmed.</p>
                <p class="mt-2">You can login using your credentials.</p>
            </div>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" 
               class="block w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition">
                Go to Login Page
            </a>
        </div>
    </body>
    </html>
  `);
}

// Helper function to send success page (your existing success page, slightly modified)
function sendSuccessPage(res, doctor) {
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Confirmed Successfully - Medical Portal</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            * { font-family: 'Inter', sans-serif; }
            body {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
            }
            .success-icon {
                animation: bounce 1s ease infinite alternate;
            }
            @keyframes bounce {
                from { transform: translateY(0); }
                to { transform: translateY(-10px); }
            }
            .pulse {
                animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        </style>
    </head>
    <body class="flex items-center justify-center p-4">
        <div class="max-w-2xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
            <!-- Success Header -->
            <div class="bg-gradient-to-r from-green-500 to-emerald-600 p-10 text-center">
                <div class="success-icon w-24 h-24 bg-white/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                        <svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                </div>
                <h1 class="text-4xl font-bold text-white mb-3">Account Confirmed!</h1>
                <p class="text-xl text-white/90">Your doctor account is now active</p>
            </div>
            
            <!-- Main Content -->
            <div class="p-8">
                <!-- Doctor Info -->
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Dr. ${doctor.firstName} ${doctor.lastName}</h2>
                    <p class="text-gray-600">${doctor.email}</p>
                </div>
                
                <!-- Status Badge -->
                <div class="inline-flex items-center px-6 py-3 rounded-full bg-green-100 text-green-800 font-bold text-lg mb-8">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    ACCOUNT STATUS: APPROVED
                </div>
                
                <!-- Instructions -->
                <div class="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl mb-8">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Next Steps:</h3>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>Go to the login page</li>
                        <li>Enter your email: <strong class="text-blue-600">${doctor.email}</strong></li>
                        <li>Enter your password (created during registration)</li>
                        <li>Click "Login" to access your dashboard</li>
                    </ol>
                </div>
                
                <!-- Action Button -->
                <div class="text-center">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" 
                       class="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-xl rounded-xl hover:opacity-90 transition mb-4">
                        <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
                        </svg>
                        Go to Login Page
                    </a>
                    
                    <div class="pulse bg-blue-100 inline-flex items-center px-4 py-2 rounded-full">
                        <svg class="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span class="text-blue-700 font-medium">
                            Auto-redirect in <span id="countdown" class="font-bold">10</span> seconds
                        </span>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            // Auto-redirect after 10 seconds
            let seconds = 10;
            const countdown = document.getElementById('countdown');
            const interval = setInterval(() => {
                seconds--;
                countdown.textContent = seconds;
                if (seconds <= 0) {
                    clearInterval(interval);
                    window.location.href = '${process.env.FRONTEND_URL || 'http://localhost:5173'}/login';
                }
            }, 1000);
        </script>
    </body>
    </html>
  `);
}

const getDoctors = async (req, res, next) => {
  try {
    const { status } = req.query;

    // optional validation
    const allowedStatuses = [
      "pending",
      "active",
      "rejected",
      "suspended",
      "inactive",
      "approved",
    ];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const filter = {
      role: "doctor",
    };

    if (status) {
      filter.status = status;
    }

    const doctors = await User.find(filter)
      .select("firstName lastName email phoneNumber status doctorProfile confirmedAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerDoctor,
  updateStatus,
  confirmDoctor,
  getDoctors
};