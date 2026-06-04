# Chat API Documentation

Base URL:

```http
/api/chat
```

All REST chat routes require authentication.

```http
Authorization: Bearer <access_token>
```

REST error responses are returned by the global error handler in this shape:

```json
{
  "success": false,
  "message": "Error message",
  "errors": []
}
```

The chat system has two parts:

- REST APIs for creating/fetching chats, loading messages, and uploading media.
- Socket.IO events for real-time messaging, typing indicators, and read receipts.

## REST APIs

### 1. Initialize Chat

Creates a chat for an appointment, or returns the existing chat if it already exists.

```http
POST /api/chat/init
```

Authentication: Required

Request body:

```json
{
  "appointmentId": "appointment_id_here"
}
```

Success response:

```json
{
  "statusCode": 200,
  "data": {
    "_id": "chat_id",
    "appointmentId": "appointment_id",
    "doctorId": {
      "_id": "doctor_id",
      "name": "Doctor Name",
      "image": "doctor_image_url",
      "speciality": "Speciality"
    },
    "patientId": {
      "_id": "patient_user_id",
      "name": "Patient Name",
      "email": "patient@example.com",
      "image": "patient_image_url"
    },
    "isActive": true,
    "createdAt": "2026-05-21T10:00:00.000Z",
    "updatedAt": "2026-05-21T10:00:00.000Z"
  },
  "message": "Chat initialized",
  "success": true
}
```

Possible errors:

```json
{
  "statusCode": 400,
  "message": "appointmentId is required",
  "success": false
}
```

```json
{
  "statusCode": 403,
  "message": "You are not authorized to join the chat for this appointment",
  "success": false
}
```

```json
{
  "statusCode": 404,
  "message": "Appointment not found",
  "success": false
}
```

Notes:

- Only the doctor or patient linked to the appointment can initialize the chat.
- One chat room is created per appointment.

## 2. Get Logged-In User Chats

Returns all chats for the authenticated user.

```http
GET /api/chat
```

Optional query parameters:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| appointmentId | string | No | Returns only the chat for this appointment, still scoped to the authenticated user |

Authentication: Required

Success response:

```json
{
  "statusCode": 200,
  "data": [
    {
      "_id": "chat_id",
      "appointmentId": "appointment_id",
      "doctorId": {
        "_id": "doctor_id",
        "name": "Doctor Name",
        "image": "doctor_image_url",
        "speciality": "Speciality"
      },
      "patientId": {
        "_id": "patient_user_id",
        "name": "Patient Name",
        "email": "patient@example.com",
        "image": "patient_image_url"
      },
      "lastMessage": {
        "_id": "message_id",
        "chatId": "chat_id",
        "senderId": "sender_id",
        "senderModel": "User",
        "messageType": "text",
        "content": "Hello doctor",
        "isRead": false,
        "createdAt": "2026-05-21T10:00:00.000Z",
        "updatedAt": "2026-05-21T10:00:00.000Z"
      },
      "isActive": true,
      "createdAt": "2026-05-21T10:00:00.000Z",
      "updatedAt": "2026-05-21T10:05:00.000Z"
    }
  ],
  "message": "Chats fetched",
  "success": true
}
```

Notes:

- Doctor users get chats where they are the appointment doctor.
- Patient users get chats where they are the appointment patient.
- Results are sorted by latest updated chat first.
- The optional `appointmentId` filter can be used when opening chat directly from an appointment.

## 3. Get Chat Messages

Returns all messages for a chat in oldest-first order.

```http
GET /api/chat/:chatId/messages
```

Authentication: Required

Path parameters:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| chatId | string | Yes | Chat MongoDB ID |

Success response:

```json
{
  "statusCode": 200,
  "data": [
    {
      "_id": "message_id",
      "chatId": "chat_id",
      "senderId": "sender_id",
      "senderModel": "User",
      "messageType": "text",
      "content": "Hello doctor",
      "isRead": true,
      "createdAt": "2026-05-21T10:00:00.000Z",
      "updatedAt": "2026-05-21T10:00:00.000Z"
    },
    {
      "_id": "message_id_2",
      "chatId": "chat_id",
      "senderId": "doctor_id",
      "senderModel": "Doctor",
      "messageType": "image",
      "content": "https://file-url.com/image.png",
      "fileName": "image.png",
      "isRead": false,
      "createdAt": "2026-05-21T10:02:00.000Z",
      "updatedAt": "2026-05-21T10:02:00.000Z"
    }
  ],
  "message": "Messages fetched",
  "success": true
}
```

Possible errors:

```json
{
  "statusCode": 404,
  "message": "Chat not found",
  "success": false
}
```

```json
{
  "statusCode": 403,
  "message": "Not authorized to view this chat",
  "success": false
}
```

Notes:

- Fetching messages marks unread messages from the other participant as read in the database. The response may still contain the pre-update `isRead` values for messages fetched in that request.
- Only chat participants can view messages.
- Admin and super admin users can fetch messages, but normal chat access should be treated as participant-only.

## 4. Upload Chat Media

Uploads a file for use in chat messages.

```http
POST /api/chat/upload
```

Authentication: Required

Content type:

```http
multipart/form-data
```

Form data:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| file | file | Yes | Image, PDF, or audio file |

Allowed file types:

- `application/pdf`
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/webp`
- `audio/mpeg`
- `audio/webm`
- `audio/wav`
- `audio/ogg`

Maximum file size:

```text
20MB
```

Success response:

```json
{
  "statusCode": 200,
  "data": {
    "fileUrl": "https://uploaded-file-url.com/file.png",
    "fileName": "file.png"
  },
  "message": "File uploaded",
  "success": true
}
```

Possible errors:

```json
{
  "success": false,
  "error": "Invalid file type. Only PDFs, Images, and Audio files are allowed."
}
```

Multer upload validation errors use `error` instead of the standard `message` field.

```json
{
  "statusCode": 400,
  "message": "No file provided",
  "success": false
}
```

## Socket.IO Chat

Socket namespace:

```text
/chat
```

Socket connection requires the user ID and user model in `auth` or query params. The current socket middleware does not verify a JWT; it trusts the supplied `userId` and `userModel`, then participant checks are applied on `join_chat` and `send_message`.

Frontend connection example:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:5000/chat", {
  auth: {
    userId: "user_or_doctor_id",
    userModel: "User"
  }
});
```

For doctors:

```js
const socket = io("http://localhost:5000/chat", {
  auth: {
    userId: "doctor_profile_id",
    userModel: "Doctor"
  }
});
```

Allowed `userModel` values:

- `User`
- `Doctor`

Important:

- For patients, `userId` is the User ID.
- For doctors, `userId` is the Doctor profile ID, not the User ID.

## Socket Events

### 1. Join Chat Room

Client emits:

```js
socket.emit("join_chat", "chat_id", (response) => {
  console.log(response);
});
```

Purpose:

Join a specific chat room before sending or receiving messages for that chat.

Success callback:

```json
{
  "success": true,
  "chatId": "chat_id"
}
```

Error callback:

```json
{
  "success": false,
  "error": "Not authorized to join this chat"
}
```

## 2. Send Message

Client emits:

```js
socket.emit(
  "send_message",
  {
    chatId: "chat_id",
    messageType: "text",
    content: "Hello doctor"
  },
  (response) => {
    console.log(response);
  }
);
```

Text message payload:

```json
{
  "chatId": "chat_id",
  "messageType": "text",
  "content": "Hello doctor"
}
```

Image/document/voice message payload:

```json
{
  "chatId": "chat_id",
  "messageType": "image",
  "content": "https://uploaded-file-url.com/image.png",
  "fileName": "image.png"
}
```

Supported `messageType` values:

- `text`
- `image`
- `document`
- `voice_note`

Success callback:

```json
{
  "success": true,
  "message": {
    "_id": "message_id",
    "chatId": "chat_id",
    "senderId": "sender_id",
    "senderModel": "User",
    "messageType": "text",
    "content": "Hello doctor",
    "isRead": false,
    "createdAt": "2026-05-21T10:00:00.000Z",
    "updatedAt": "2026-05-21T10:00:00.000Z"
  }
}
```

Error callback:

```json
{
  "success": false,
  "error": "Chat not found"
}
```

Other possible send errors:

```json
{
  "success": false,
  "error": "Not authorized to send messages in this chat"
}
```

Server broadcasts:

```js
socket.on("receive_message", (message) => {
  console.log(message);
});
```

Broadcast payload:

```json
{
  "_id": "message_id",
  "chatId": "chat_id",
  "senderId": "sender_id",
  "senderModel": "User",
  "messageType": "text",
  "content": "Hello doctor",
  "fileName": "file.png",
  "isRead": false,
  "createdAt": "2026-05-21T10:00:00.000Z",
  "updatedAt": "2026-05-21T10:00:00.000Z"
}
```

## 3. Typing Indicator

Client emits:

```js
socket.emit("typing", {
  chatId: "chat_id",
  isTyping: true
});
```

Stop typing:

```js
socket.emit("typing", {
  chatId: "chat_id",
  isTyping: false
});
```

Other participant listens:

```js
socket.on("user_typing", (data) => {
  console.log(data.userId, data.isTyping);
});
```

Payload received:

```json
{
  "userId": "sender_id",
  "isTyping": true
}
```

Note: the current `typing` event does not verify chat participation itself. Clients should only emit it after a successful `join_chat`.

## 4. Mark Messages As Read

Client emits:

```js
socket.emit("mark_read", {
  chatId: "chat_id",
  messageIds: ["message_id_1", "message_id_2"]
});
```

Other participant listens:

```js
socket.on("messages_read", (data) => {
  console.log(data.messageIds);
});
```

Payload received:

```json
{
  "messageIds": ["message_id_1", "message_id_2"]
}
```

Note: the current `mark_read` event updates the supplied message IDs and broadcasts to the room. It does not independently verify that the socket user belongs to the chat or that the message IDs belong to the chat.

## Socket.IO Consultation Status

Consultation status events use a separate namespace:

```text
/consultation
```

This namespace is used for doctor-patient consultation room state, such as notifying the patient when a doctor starts the consultation and notifying the doctor when the patient joins or rejects.

### Connection And Identify

Frontend connection example:

```js
import { io } from "socket.io-client";

const consultationSocket = io("http://localhost:5000/consultation");

consultationSocket.emit("identify", "user_id");
```

Important:

- For patients, identify with the Patient's `User._id`.
- For doctors, identify with the Doctor user's `User._id`. The backend also emits to the Doctor profile ID room for compatibility.
- Patient status events require `identify` first. If the socket is not identified, the callback returns `Socket is not identified`.

### Doctor Starts Or Re-Triggers Consultation

REST endpoint:

```http
POST /api/consultations/start
```

When this endpoint is called successfully, the backend emits this event to the patient every time, including when the consultation already exists and the doctor clicks "Add Patient" / starts again.

Patient listens:

```js
consultationSocket.on("consultation:inprogress", (payload) => {
  console.log(payload);
});
```

Payload:

```json
{
  "consultationId": "consultation_id",
  "appointmentId": "appointment_id",
  "doctorId": "doctor_profile_id",
  "status": "IN_PROGRESS",
  "patientStatus": "WAITING_FOR_PATIENT",
  "startedAt": "2026-05-21T10:00:00.000Z",
  "doctor": {
    "_id": "doctor_profile_id",
    "name": "Doctor Name",
    "email": "doctor@example.com",
    "phone": "03000000000",
    "speciality": "speciality_id",
    "image": "doctor_image_url",
    "pmdcRegistrationNumber": "PMDC-123"
  },
  "message": "Your doctor has started the consultation. Please join now."
}
```

Notes:

- The backend also sends the consultation FCM/push notification every time this endpoint is called successfully.
- On every successful start/re-trigger, `patientStatus` is reset to `WAITING_FOR_PATIENT`.

### Patient Joined

Patient emits:

```js
consultationSocket.emit(
  "patient_joined",
  {
    consultationId: "consultation_id"
  },
  (response) => {
    console.log(response);
  }
);
```

Alternative payload using appointment ID:

```json
{
  "appointmentId": "appointment_id"
}
```

Doctor listens:

```js
consultationSocket.on("patient_joined", (payload) => {
  console.log(payload);
});

consultationSocket.on("consultation:patient_status", (payload) => {
  console.log(payload);
});
```

Success callback / doctor payload:

```json
{
  "success": true,
  "consultationId": "consultation_id",
  "appointmentId": "appointment_id",
  "patientId": "patient_user_id",
  "doctorId": "doctor_profile_id",
  "status": "PATIENT_JOINED",
  "patientStatus": "PATIENT_JOINED",
  "updatedAt": "2026-05-21T10:01:00.000Z"
}
```

### Patient Rejected

Patient emits:

```js
consultationSocket.emit(
  "patient_rejected",
  {
    consultationId: "consultation_id"
  },
  (response) => {
    console.log(response);
  }
);
```

Alternative payload using appointment ID:

```json
{
  "appointmentId": "appointment_id"
}
```

Doctor listens:

```js
consultationSocket.on("patient_rejected", (payload) => {
  console.log(payload);
});

consultationSocket.on("consultation:patient_status", (payload) => {
  console.log(payload);
});
```

Success callback / doctor payload:

```json
{
  "success": true,
  "consultationId": "consultation_id",
  "appointmentId": "appointment_id",
  "patientId": "patient_user_id",
  "doctorId": "doctor_profile_id",
  "status": "PATIENT_REJECTED",
  "patientStatus": "PATIENT_REJECTED",
  "updatedAt": "2026-05-21T10:02:00.000Z"
}
```

Possible callback errors:

```json
{
  "success": false,
  "error": "consultationId or appointmentId is required"
}
```

```json
{
  "success": false,
  "error": "Consultation not found"
}
```

```json
{
  "success": false,
  "error": "Not authorized"
}
```

Persisted consultation patient statuses:

- `WAITING_FOR_PATIENT`
- `PATIENT_JOINED`
- `PATIENT_REJECTED`

## Suggested Frontend Flow

1. Login and store the access token.
2. Initialize chat using the appointment ID.
3. Save the returned `chat._id`.
4. Connect to Socket.IO namespace `/chat`.
5. Emit `join_chat` with the chat ID.
6. Fetch old messages using `GET /api/chat/:chatId/messages`.
7. Send text messages using the `send_message` socket event.
8. For media messages:
   - Upload file using `POST /api/chat/upload`.
   - Use returned `fileUrl` as message `content`.
   - Send the message over Socket.IO with correct `messageType`.

## Suggested Consultation Status Flow

1. Doctor connects to `/consultation` and emits `identify` with the Doctor user's `User._id`.
2. Patient connects to `/consultation` and emits `identify` with the Patient's `User._id`.
3. Doctor calls `POST /api/consultations/start` when clicking "Add Patient" or starting the room.
4. Patient receives `consultation:inprogress`.
5. If the patient joins, patient emits `patient_joined` with `consultationId` or `appointmentId`.
6. If the patient rejects, patient emits `patient_rejected` with `consultationId` or `appointmentId`.
7. Doctor listens for `consultation:patient_status`, `patient_joined`, and `patient_rejected` to update the consultation room UI.

## Example Complete Media Flow

Upload image:

```http
POST /api/chat/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

Form data:

```text
file: prescription.png
```

Response:

```json
{
  "statusCode": 200,
  "data": {
    "fileUrl": "https://uploaded-file-url.com/prescription.png",
    "fileName": "prescription.png"
  },
  "message": "File uploaded",
  "success": true
}
```

Send image message:

```js
socket.emit("send_message", {
  chatId: "chat_id",
  messageType: "image",
  content: "https://uploaded-file-url.com/prescription.png",
  fileName: "prescription.png"
});
```

## Data Models

### Chat

```json
{
  "_id": "chat_id",
  "appointmentId": "appointment_id",
  "patientId": "user_id",
  "doctorId": "doctor_profile_id",
  "lastMessage": "message_id",
  "isActive": true,
  "createdAt": "2026-05-21T10:00:00.000Z",
  "updatedAt": "2026-05-21T10:00:00.000Z"
}
```

### Message

```json
{
  "_id": "message_id",
  "chatId": "chat_id",
  "senderId": "user_or_doctor_id",
  "senderModel": "User",
  "messageType": "text",
  "content": "Message text or media URL",
  "fileName": "optional_file_name",
  "isRead": false,
  "createdAt": "2026-05-21T10:00:00.000Z",
  "updatedAt": "2026-05-21T10:00:00.000Z"
}
```
