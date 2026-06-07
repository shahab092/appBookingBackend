# Frontend Integration Guide: Incoming Video Call Push Notifications

## Overview
When a user initiates a video call, the backend sends a **data-only** FCM push notification. This guide explains how to handle it on the frontend (React Native / Flutter / Web).

---

## 1. Firebase Setup (React Native / Flutter)

### React Native Firebase
```bash
npm install @react-native-firebase/messaging
```

### Flutter Firebase
```yaml
dependencies:
  firebase_messaging: ^14.0.0
```

---

## 2. Handle Background Messages

### React Native
```javascript
import messaging from '@react-native-firebase/messaging';

// Listen for messages when app is in background/killed
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('Message handled in the background!', remoteMessage);

  const { data } = remoteMessage;

  // Check if this is a video call notification
  if (data?.type === 'INCOMING_VIDEO_CALL') {
    // Show full-screen incoming call UI
    showIncomingCallScreen({
      callerName: data.callerName,
      callerId: data.callerId,
      consultationId: data.consultationId,
      appointmentId: data.appointmentId,
      offer: data.offer, // Will be null if offer was too large (>3KB)
    });
  }
});
```

### Flutter
```dart
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('Handling a background message: ${message.data}');

  final data = message.data;

  if (data['type'] == 'INCOMING_VIDEO_CALL') {
    // Show incoming call notification
    _showIncomingCallUI(
      callerName: data['callerName'],
      callerId: data['callerId'],
      consultationId: data['consultationId'],
      appointmentId: data['appointmentId'],
      offer: data['offer'],
    );
  }
}

void setupBackgroundHandler() {
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
}
```

---

## 3. Handle Foreground Messages

### React Native
```javascript
import messaging from '@react-native-firebase/messaging';

// Listen for messages when app is in foreground
messaging().onMessage(async (remoteMessage) => {
  console.log('Message received while app is in foreground:', remoteMessage);

  const { data } = remoteMessage;

  if (data?.type === 'INCOMING_VIDEO_CALL') {
    // Show incoming call modal/screen
    navigateTo('IncomingCall', {
      callerName: data.callerName,
      callerId: data.callerId,
      consultationId: data.consultationId,
      appointmentId: data.appointmentId,
      offer: data.offer,
    });
  }
});
```

### Flutter
```dart
void setupForegroundHandler() {
  FirebaseMessaging.onMessage.listen((RemoteMessage message) {
    print('Received message in foreground: ${message.data}');

    final data = message.data;
    if (data['type'] == 'INCOMING_VIDEO_CALL') {
      _showIncomingCallDialog(
        callerName: data['callerName'],
        callerId: data['callerId'],
        consultationId: data['consultationId'],
        appointmentId: data['appointmentId'],
        offer: data['offer'],
      );
    }
  });
}
```

---

## 4. WebRTC Offer Handling

### If `offer` is included in data:
The WebRTC offer is small enough (< 3KB) and included in the push notification.
```javascript
if (data.offer) {
  // Parse and use offer immediately
  const sdpOffer = JSON.parse(data.offer);
  // Create answer and proceed with call
  initiateCall(sdpOffer);
}
```

### If `offer` is NOT included:
The offer was too large (> 3KB). **Frontend must reconnect to WebSocket to fetch it.**
```javascript
async function fetchOfferFromSocket() {
  // Reconnect to WebSocket
  socket.connect();
  
  // Listen for incoming-call event from socket
  socket.on('incoming-call', ({ from, fromName, offer }) => {
    const sdpOffer = offer;
    initiateCall(sdpOffer);
  });

  // Notify backend that you're ready
  socket.emit('ready-for-offer', {
    callerId: data.callerId,
  });
}
```

---

## 5. Payload Structure Reference

### Data payload from FCM:
```json
{
  "type": "INCOMING_VIDEO_CALL",
  "callerName": "Dr. Smith",
  "callerId": "65ab34cd...",
  "consultationId": "65ab34ce...",
  "appointmentId": "65ab34cf...",
  "offer": "{\"type\":\"offer\",\"sdp\":\"...\"}" // Optional, only if < 3KB
}
```

---

## 6. Incoming Call Screen Example

### React Native
```javascript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';

export default function IncomingCallScreen({ route, navigation }) {
  const { callerName, callerId, offer } = route.params;

  const handleAccept = async () => {
    // If offer is available, use it directly
    if (offer) {
      const sdpOffer = JSON.parse(offer);
      // Start call with offer
      startCall(sdpOffer);
    } else {
      // Reconnect socket to get offer
      await fetchOfferFromSocket(callerId);
    }
    navigation.navigate('VideoCall');
  };

  const handleReject = () => {
    // Notify caller
    socket.emit('reject-call', { targetId: callerId });
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: 'https://api.example.com/user/' + callerId + '/avatar' }}
        style={styles.avatar}
      />
      <Text style={styles.callerName}>{callerName}</Text>
      <Text style={styles.callText}>Incoming Video Call</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.rejectButton]}
          onPress={handleReject}
        >
          <Text style={styles.buttonText}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={handleAccept}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  callText: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 40,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  button: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
```

### Flutter
```dart
import 'package:flutter/material.dart';

class IncomingCallScreen extends StatefulWidget {
  final String callerName;
  final String callerId;
  final String? offer;

  const IncomingCallScreen({
    required this.callerName,
    required this.callerId,
    this.offer,
  });

  @override
  _IncomingCallScreenState createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  Future<void> handleAccept() async {
    if (widget.offer != null) {
      // Offer available, start call immediately
      final sdpOffer = jsonDecode(widget.offer!);
      startCall(sdpOffer);
    } else {
      // Fetch offer from socket
      await fetchOfferFromSocket(widget.callerId);
    }
    Navigator.pushNamed(context, '/video-call');
  }

  void handleReject() {
    socket.emit('reject-call', {'targetId': widget.callerId});
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 60,
              backgroundImage: NetworkImage(
                'https://api.example.com/user/${widget.callerId}/avatar',
              ),
            ),
            SizedBox(height: 20),
            Text(
              widget.callerName,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            SizedBox(height: 10),
            Text(
              'Incoming Video Call',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            ),
            SizedBox(height: 40),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FloatingActionButton(
                  backgroundColor: Colors.red,
                  onPressed: handleReject,
                  child: Icon(Icons.call_end),
                ),
                SizedBox(width: 20),
                FloatingActionButton(
                  backgroundColor: Colors.green,
                  onPressed: handleAccept,
                  child: Icon(Icons.call),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## 7. Socket.IO Integration

Register and manage device tokens:

### React Native
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';

async function registerDeviceToken() {
  // Get FCM token
  const token = await messaging().getToken();

  // Send to backend
  const response = await fetch('https://api.example.com/api/notifications/register-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      token,
      deviceType: 'android', // or 'ios', 'web'
      os: 'Android 14',      // Platform info
      browser: 'Native App',
    }),
  });

  console.log('Device token registered:', await response.json());
}

// Call on app startup
registerDeviceToken();
```

### Flutter
```dart
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> registerDeviceToken(String authToken) async {
  final messaging = FirebaseMessaging.instance;
  
  // Get FCM token
  final token = await messaging.getToken();

  // Send to backend
  final response = await http.post(
    Uri.parse('https://api.example.com/api/notifications/register-token'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $authToken',
    },
    body: jsonEncode({
      'token': token,
      'deviceType': 'android', // or 'ios'
      'os': 'Android 14',
      'browser': 'Flutter App',
    }),
  );

  print('Device token registered: ${response.statusCode}');
}
```

---

## 8. Checklist

- [ ] Setup Firebase Messaging in your project
- [ ] Configure background message handler
- [ ] Configure foreground message handler
- [ ] Create IncomingCallScreen UI
- [ ] Handle Accept action (with/without offer)
- [ ] Handle Reject action (emit to socket)
- [ ] Register device token on app startup
- [ ] Test with test notification endpoint
- [ ] Handle socket reconnection for large offers
- [ ] Test app in background/killed state

---

## 9. Testing

### Send a Test Notification
```bash
curl -X POST https://api.example.com/api/notifications/send-test \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "target_user_id",
    "title": "Incoming Call",
    "body": "Dr. Smith is calling",
    "type": "INCOMING_VIDEO_CALL",
    "data": {
      "type": "INCOMING_VIDEO_CALL",
      "callerName": "Dr. Smith",
      "callerId": "doctor_id",
      "consultationId": "consult_id",
      "appointmentId": "appt_id"
    }
  }'
```

---

## Notes

- **Data-only messages**: No visible notification — app handles UI entirely
- **High priority**: Android/iOS will wake the app and deliver immediately
- **Socket fallback**: If offer is too large, frontend reconnects socket to fetch
- **Token management**: Device tokens auto-prune stale entries after failed sends
