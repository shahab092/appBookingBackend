# Appointment API Documentation (for Mobile/ApiDog)

This document provides the details for the appointment-related APIs. Base URL: `{{BACKEND_URL}}/api/appointments`

## Authentication
Most routes require a Bearer token in the `Authorization` header.
`Authorization: Bearer <your_jwt_token>`

---

## 1. Book an Appointment
**Endpoint:** `POST /`  
**Access:** Private (Patient) / Optional Guest  
**Description:** Book a new appointment slot.

### Request Body
```json
{
  "doctorId": "65f...123",
  "date": "2024-10-28",
  "timeSlot": "10:30 AM",
  "appointmentType": "online", // or "inclinic"
  "reason": "Annual checkup",
  "patientName": "John Doe", (Required for guest)
  "patientPhone": "03001234567" (Required for guest)
}
```

---

## 2. Get My Appointments (General)
**Endpoint:** `GET /` or `GET /my`  
**Access:** Private  
**Query Params:**
- `upcoming=true`: (Optional) Filter only future appointments.
**Response:** Array of appointment objects.

---

## 3. Get Patient Appointments
**Endpoint:** `GET /patient`  
**Access:** Private (Patient Only)  
**Query Params:**
- `upcoming=true`: (Optional) Filter only future appointments.

---

## 4. Get Doctor Appointments (Logged-in Doctor)
**Endpoint:** `GET /doctor`  
**Access:** Private (Doctor Only)  
**Query Params:**
- `upcoming=true`: (Optional) Filter only future appointments.

---

## 5. Update Appointment Status
**Endpoint:** `PATCH /:id/status`  
**Access:** Private  
**Request Body:**
```json
{
  "status": "cancelled" // or "completed"
}
```

---

## Appointment Object Schema
```json
{
  "_id": "string",
  "doctorId": {
    "_id": "string",
    "name": "string",
    "speciality": "string"
  },
  "patientId": "string (optional for guests)",
  "patientName": "string",
  "date": "YYYY-MM-DD",
  "timeSlot": "HH:mm (24h format)",
  "status": "booked | confirmed | cancelled | completed",
  "appointmentType": "online | inclinic",
  "locationName": "string",
  "reason": "string"
}
```
