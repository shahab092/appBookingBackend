# Chat API Documentation

Base URL:

```http
/api/chat
```

All REST chat routes require authentication.

```http
Authorization: Bearer <access_token>
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

- Fetching messages marks unread messages from the other participant as read.
- Only chat participants can view messages.

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

Socket connection requires the user ID and user model in `auth` or query params.

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
socket.emit("join_chat", "chat_id");
```

Purpose:

Join a specific chat room before sending or receiving messages for that chat.

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
