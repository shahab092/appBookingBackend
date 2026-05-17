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

---

# Chat & Messaging API (Real-time)

This section covers the REST APIs for fetching chat history and the Socket.IO events for real-time messaging.

## REST APIs
**Base URL:** `{{BACKEND_URL}}/api/chat`
**Authentication:** Required (`Authorization: Bearer <token>`)

### 1. Initialize / Fetch Chat for Appointment
**Endpoint:** `POST /init`  
**Description:** Get the existing chat room for an appointment or create a new one.
**Request Body:**
```json
{
  "appointmentId": "65f..."
}
```
**Response:** Returns the Chat Object containing the `chatId` (`_id`).

### 2. Get All User Chats
**Endpoint:** `GET /`  
**Description:** Fetches all active chats for the logged-in user (Patient or Doctor).

### 3. Get Chat Messages
**Endpoint:** `GET /:chatId/messages`  
**Description:** Fetches all messages for a specific chat. *Note: Automatically marks messages as read.*

### 4. Upload Chat Media
**Endpoint:** `POST /upload`  
**Description:** Upload an image, document, or voice note (Max 20MB).
**Body (multipart/form-data):** `file` (File)

---

## Socket.IO Real-Time Events
**Connection URL:** `{{BACKEND_URL}}/chat` *(Namespace is `/chat`)*

### Authentication / Handshake
You must pass your User ID and Model during the connection.
**Query Parameters (Recommended for ApiDog):**
`?userId=<your_id>&userModel=User` *(Use `Doctor` if logging in as a doctor)*

### 1. Join Chat Room (Client -> Server)
**Event Name:** `join_chat`
**Payload:** `"<chatId>"` (String)
**Description:** Must be emitted before sending or receiving messages in a specific chat.

### 2. Send Message (Client -> Server)
**Event Name:** `send_message`
**Payload (JSON):**
```json
{
  "chatId": "<chatId>",
  "messageType": "text", // or "image", "audio", "document"
  "content": "Hello!"
}
```

### 3. Receive Message (Server -> Client)
**Event Name:** `receive_message`
**Description:** Listen to this event to receive new messages in real-time.

### 4. Typing Indicators
**Send (Client -> Server):** `typing`
```json
{ "chatId": "<chatId>", "isTyping": true }
```
**Receive (Server -> Client):** `user_typing`
```json
{ "userId": "<userId>", "isTyping": true }
```
