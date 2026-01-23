require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Docters');
const bcrypt = require('bcrypt');

const runTest = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/appBooking');
        console.log('Connected.');

        // Cleanup
        await User.deleteMany({ whatsappnumber: { $in: ['1234567890', '0987654321'] } });
        await Doctor.deleteMany({ email: 'testdoctor@example.com' });

        console.log('1. Registering Patient...');
        const patientPass = await bcrypt.hash('password123', 10);
        const patient = await User.create({
            whatsappnumber: '1234567890',
            password: patientPass,
            role: 'patient'
        });
        console.log('Patient registered:', patient._id);

        console.log('2. Registering Doctor (Auth + Profile)...');
        const doctorPass = await bcrypt.hash('password123', 10);
        const doctorUser = await User.create({
            whatsappnumber: '0987654321',
            password: doctorPass,
            role: 'doctor'
        });
        const doctorProfile = await Doctor.create({
            userId: doctorUser._id,
            name: 'Dr. Test',
            email: 'testdoctor@example.com',
            phone: '0987654321',
            status: 'pending',
            pmdcRegistrationNumber: 'PMDC-123'
        });
        console.log('Doctor registered:', doctorUser._id, doctorProfile._id);

        console.log('3. Validating Data Split...');
        const userCheck = await User.findOne({ whatsappnumber: '0987654321' });
        const docCheck = await Doctor.findOne({ userId: userCheck._id });

        if (!userCheck.email && docCheck.email === 'testdoctor@example.com') {
            console.log('✅ Data split correctly: User has no email, Doctor has email.');
        } else {
            console.log('❌ Data split failed:', { userEmail: userCheck.email, docEmail: docCheck.email });
        }

        console.log('4. Testing Doctor Status Update...');
        docCheck.status = 'approved';
        await docCheck.save();
        console.log('Doctor status updated to approved.');

        console.log('✅ TEST COMPLETED SUCCESSFULLY');
        process.exit(0);
    } catch (e) {
        console.error('❌ TEST FAILED:', e);
        process.exit(1);
    }
};

runTest();
