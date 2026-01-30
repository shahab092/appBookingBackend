const Payment = require("../models/Payment");
const Appointment = require("../models/Appointment");

// @desc    Start payment process
// @route   POST /api/payments/start
// @access  Private/Public
exports.startPayment = async (req, res) => {
    try {
        const { appointmentId, paymentMethod, amount, userId } = req.body;

        if (!appointmentId || !paymentMethod || !amount) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Check if appointment exists
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        // Create payment record
        const payment = await Payment.create({
            appointmentId,
            userId,
            paymentMethod,
            amount,
            status: "pending"
        });

        // Dummy PayFast redirect URL
        const redirectUrl = `https://dummy-payfast.com/pay?paymentId=${payment._id}`;

        res.status(201).json({
            success: true,
            paymentId: payment._id,
            redirectUrl
        });
    } catch (error) {
        console.error("Error starting payment:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// @desc    Simulate PayFast IPN callback
// @route   POST /api/payments/callback
// @access  Public
exports.paymentCallback = async (req, res) => {
    try {
        const { appointmentId, paymentId, transactionId, status } = req.body;

        if (!paymentId || !status) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Update payment record
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: "Payment record not found" });
        }

        payment.status = status === 'paid' ? 'paid' : 'failed';
        payment.transactionId = transactionId || `TXN_${Date.now()}`;
        payment.paidAt = status === 'paid' ? new Date() : null;
        payment.gatewayResponse = req.body;
        await payment.save();

        // Update appointment if paid
        if (status === 'paid') {
            await Appointment.findByIdAndUpdate(appointmentId || payment.appointmentId, {
                paymentStatus: 'paid',
                status: 'confirmed'
            });
        } else {
            await Appointment.findByIdAndUpdate(appointmentId || payment.appointmentId, {
                paymentStatus: 'failed'
            });
        }

        res.status(200).json({
            success: true,
            message: "Callback processed successfully"
        });
    } catch (error) {
        console.error("Error in payment callback:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// @desc    Get payment status
// @route   GET /api/payments/status/:appointmentId
// @access  Private/Public
exports.getPaymentStatus = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const payment = await Payment.findOne({ appointmentId }).sort({ createdAt: -1 });

        if (!payment) {
            return res.status(404).json({ message: "Payment record not found for this appointment" });
        }

        res.status(200).json({
            success: true,
            data: {
                appointmentId: payment.appointmentId,
                userId: payment.userId,
                paymentMethod: payment.paymentMethod,
                transactionId: payment.transactionId,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                gatewayResponse: payment.gatewayResponse,
                paidAt: payment.paidAt,
                createdAt: payment.createdAt
            }
        });
    } catch (error) {
        console.error("Error getting payment status:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// @desc    Get all payments for a specific doctor
// @route   GET /api/payments/doctor/:doctorId
// @access  Private
exports.getDoctorPayments = async (req, res) => {
    try {
        const { doctorId } = req.params;

        // First find all appointments for this doctor
        const appointments = await Appointment.find({ doctorId });
        const appointmentIds = appointments.map(app => app._id);

        // Find payments for these appointments and populate appointment details
        const payments = await Payment.find({ appointmentId: { $in: appointmentIds } })
            .populate({
                path: 'appointmentId',
                select: 'patientName patientPhone date timeSlot status paymentStatus'
            })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: payments.length,
            data: payments
        });
    } catch (error) {
        console.error("Error getting doctor payments:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
