const express = require("express");
const router = express.Router();
const { startPayment, paymentCallback, getPaymentStatus } = require("../controllers/paymentController");

router.post("/start", startPayment);
router.post("/callback", paymentCallback);
router.get("/status/:appointmentId", getPaymentStatus);
router.get("/doctor/:doctorId", require("../controllers/paymentController").getDoctorPayments);

module.exports = router;
