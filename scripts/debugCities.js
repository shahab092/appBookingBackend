require('dotenv').config();
const mongoose = require('mongoose');
const Doctor = require('../models/Docters');

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const sample = await Doctor.findOne({ status: 'approved' });
        if (sample) {
            console.log('Sample Doctor Address Structure:');
            console.log(JSON.stringify(sample.address, null, 2));
            console.log('Type of address:', typeof sample.address);
        } else {
            console.log('❌ No approved doctors found');
        }

        const allStatus = await Doctor.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log('Doctors by status:', allStatus);

        await mongoose.connection.close();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkData();
