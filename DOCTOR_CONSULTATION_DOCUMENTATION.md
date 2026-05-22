# Doctor Consultation Recording API Documentation

This guide explains how a doctor records a patient consultation after an
appointment has been booked.

Base URL:

```text
{{BACKEND_URL}}
```

All consultation routes require a doctor JWT:

```text
Authorization: Bearer <doctor_jwt_token>
Content-Type: application/json
```

## Doctor Workflow

1. Get the doctor's appointments.
2. Start a consultation for a registered patient appointment.
3. Add symptoms, investigations, diagnoses, medications, follow-up, and notes.
4. Complete the consultation.
5. Fetch the RX/prescription data.

Important:

- A consultation can only be started by the doctor assigned to the appointment.
- The appointment must belong to a registered patient. Guest appointments cannot start a consultation because they do not have `patientId`.
- Completed or cancelled consultations cannot be edited.
- One appointment can have only one consultation. Calling the start API again returns the existing consultation.

## 1. Get Doctor Appointments

Use this endpoint to show the doctor their appointments and get the
`appointmentId`.

```http
GET /api/appointments/doctor
```

Optional query:

```http
GET /api/appointments/doctor?upcoming=true
```

Example response data item:

```json
{
  "_id": "665f4a9c8a4a111111111111",
  "doctorId": "665f49008a4a111111111111",
  "patientId": {
    "_id": "665f48008a4a111111111111",
    "name": "Ali Khan",
    "email": "ali@example.com",
    "whatsappnumber": "923001234567"
  },
  "patientName": "Ali Khan",
  "patientPhone": "923001234567",
  "date": "2026-05-20",
  "timeSlot": "10:30",
  "status": "booked",
  "appointmentType": "inclinic",
  "reason": "Fever and body pain"
}
```

Use `_id` from the appointment as `appointmentId` in the next step.

## 2. Start Consultation

```http
POST /api/consultations/start
```

Doctor only.

Request body:

```json
{
  "appointmentId": "665f4a9c8a4a111111111111"
}
```

Success response:

```json
{
  "statusCode": 201,
  "data": {
    "_id": "665f4b008a4a111111111111",
    "appointmentId": {
      "_id": "665f4a9c8a4a111111111111"
    },
    "patientId": {
      "_id": "665f48008a4a111111111111",
      "whatsappnumber": "923001234567",
      "role": "patient"
    },
    "doctorId": {
      "_id": "665f49008a4a111111111111",
      "name": "Dr. Ahmed",
      "email": "doctor@example.com",
      "phone": "923009999999",
      "pmdcRegistrationNumber": "PMDC-12345"
    },
    "status": "IN_PROGRESS",
    "symptoms": [],
    "investigations": [],
    "diagnoses": [],
    "medications": [],
    "notes": [],
    "startedAt": "2026-05-19T10:00:00.000Z"
  },
  "message": "Consultation started successfully",
  "success": true
}
```

Save `data._id` as `consultationId`.

## 3. Get Consultation Details

```http
GET /api/consultations/:consultationId
```

Example:

```http
GET /api/consultations/665f4b008a4a111111111111
```

This returns the full consultation record including symptoms,
investigations, diagnoses, medications, follow-up, notes, and logs.

## 4. Record Symptoms

```http
PATCH /api/consultations/:consultationId/symptoms
```

Doctor or patient can add symptoms.

Add symptom:

```json
{
  "action": "add",
  "name": "Fever",
  "duration": "3 days",
  "severity": "moderate",
  "notes": "Worse at night with chills"
}
```

Allowed `severity` values:

```text
mild, moderate, severe, MILD, MODERATE, SEVERE
```

Update symptom:

```json
{
  "action": "update",
  "symptomId": "665f4b118a4a111111111111",
  "name": "High fever",
  "duration": "4 days",
  "severity": "severe",
  "notes": "Associated with chills"
}
```

Delete symptom:

```json
{
  "action": "delete",
  "symptomId": "665f4b118a4a111111111111"
}
```

Required fields:

- Add: `name`
- Update/delete: `symptomId`

## 5. Order Investigations

```http
PATCH /api/consultations/:consultationId/investigations
```

Doctor only.

Add investigation:

```json
{
  "action": "add",
  "testName": "Complete Blood Count",
  "testType": "blood_test",
  "instructions": "Fasting not required"
}
```

Allowed `testType` values:

```text
blood_test, ultrasound, xray, mri, ct_scan, urine_test, other
```

Allowed `status` values:

```text
ORDERED, SAMPLE_COLLECTED, RESULT_UPLOADED, REVIEWED, CANCELLED
```

Update investigation:

```json
{
  "action": "update",
  "investigationId": "665f4b918a4a111111111111",
  "testName": "CBC with ESR",
  "testType": "blood_test",
  "instructions": "Upload report before next visit",
  "status": "ORDERED"
}
```

Delete investigation:

```json
{
  "action": "delete",
  "investigationId": "665f4b918a4a111111111111"
}
```

Required fields:

- Add: `testName`
- Update/delete: `investigationId`

## 6. Review Patient Uploaded Investigation Results

Patients upload results through:

```http
PATCH /api/consultations/:consultationId/investigations/:investigationId/result
```

That route is patient only. Doctors can view uploaded files by fetching:

```http
GET /api/consultations/:consultationId
```

Result data appears inside the matching investigation:

```json
{
  "_id": "665f4b918a4a111111111111",
  "testName": "Complete Blood Count",
  "status": "RESULT_UPLOADED",
  "resultFiles": [
    {
      "fileName": "cbc-report.pdf",
      "fileUrl": "https://cdn.example.com/cbc-report.pdf",
      "mimeType": "application/pdf",
      "size": 245000,
      "uploadedAt": "2026-05-19T11:00:00.000Z"
    }
  ],
  "resultNotes": "CBC report attached. Hemoglobin is low."
}
```

To mark a result as reviewed, update the investigation status:

```json
{
  "action": "update",
  "investigationId": "665f4b918a4a111111111111",
  "status": "REVIEWED"
}
```

## 7. Add Diagnoses

```http
PATCH /api/consultations/:consultationId/diagnoses
```

Doctor only.

Add diagnosis:

```json
{
  "action": "add",
  "diseaseName": "Viral upper respiratory infection",
  "diagnosisType": "final",
  "notes": "No signs of pneumonia"
}
```

Allowed `diagnosisType` values:

```text
differential, final
```

Update diagnosis:

```json
{
  "action": "update",
  "diagnosisId": "665f4bf98a4a111111111111",
  "diseaseName": "Acute bronchitis",
  "diagnosisType": "differential",
  "notes": "Review after CBC"
}
```

Delete diagnosis:

```json
{
  "action": "delete",
  "diagnosisId": "665f4bf98a4a111111111111"
}
```

Required fields:

- Add: `diseaseName`, `diagnosisType`
- Update/delete: `diagnosisId`

## 8. Add Medications

```http
PATCH /api/consultations/:consultationId/medications
```

Doctor only.

Add medication:

```json
{
  "action": "add",
  "medicineName": "Paracetamol",
  "dose": "500",
  "doseUnit": "mg",
  "frequency": "Every 8 hours",
  "duration": "3 days",
  "route": "oral",
  "instructions": "Take after food",
  "quantity": 9
}
```

Update medication:

```json
{
  "action": "update",
  "medicationId": "665f4c708a4a111111111111",
  "medicineName": "Paracetamol",
  "dose": "500",
  "doseUnit": "mg",
  "frequency": "Every 6 hours if fever",
  "duration": "3 days",
  "route": "oral",
  "instructions": "Do not exceed 4 doses/day",
  "quantity": 12
}
```

Delete medication:

```json
{
  "action": "delete",
  "medicationId": "665f4c708a4a111111111111"
}
```

Required fields:

- Add: `medicineName`, `dose`, `frequency`, `duration`
- Update/delete: `medicationId`

## 9. Add Follow-Up

```http
PATCH /api/consultations/:consultationId/follow-up
```

Doctor only.

Request body:

```json
{
  "followUpDate": "2026-05-24T10:00:00.000Z",
  "reason": "Review symptoms and CBC report",
  "instructions": "Return earlier if breathing difficulty develops"
}
```

Required field:

- `followUpDate`

The same endpoint is used to update the follow-up.

## 10. Add Doctor Notes

```http
PATCH /api/consultations/:consultationId/notes
```

Doctor only.

Add note:

```json
{
  "action": "add",
  "noteType": "instruction",
  "note": "Increase fluids and rest for 48 hours"
}
```

Update note:

```json
{
  "action": "update",
  "noteId": "665f4cc28a4a111111111111",
  "noteType": "instruction",
  "note": "Increase fluids and monitor temperature"
}
```

Delete note:

```json
{
  "action": "delete",
  "noteId": "665f4cc28a4a111111111111"
}
```

Required fields:

- Add: `noteType`, `note`
- Update/delete: `noteId`

## 11. Complete Consultation

```http
PATCH /api/consultations/:consultationId/complete
```

Doctor only.

Request body:

```json
{}
```

When completed:

- Consultation status becomes `COMPLETED`.
- Appointment status becomes `completed`.
- The consultation can no longer be edited.

## 12. Get RX / Prescription Data

```http
GET /api/consultations/:consultationId/rx
```

Doctor or linked patient can access this route.

The response contains:

- `consultationId`
- `status`
- `patient`
- `doctor`
- `appointment`
- `symptoms`
- `investigations`
- `diagnoses`
- `medications`
- `followUp`
- `notes`
- `createdAt`
- `startedAt`
- `completedAt`

Example response shape:

```json
{
  "statusCode": 200,
  "data": {
    "consultationId": "665f4b008a4a111111111111",
    "status": "COMPLETED",
    "patient": {
      "name": "Ali Khan",
      "phone": "923001234567",
      "email": "ali@example.com"
    },
    "doctor": {
      "_id": "665f49008a4a111111111111",
      "name": "Dr. Ahmed",
      "pmdcRegistrationNumber": "PMDC-12345"
    },
    "appointment": {
      "_id": "665f4a9c8a4a111111111111",
      "date": "2026-05-20",
      "timeSlot": "10:30"
    },
    "symptoms": [],
    "investigations": [],
    "diagnoses": [],
    "medications": [],
    "followUp": {},
    "notes": [],
    "startedAt": "2026-05-19T10:00:00.000Z",
    "completedAt": "2026-05-19T10:20:00.000Z"
  },
  "message": "Prescription fetched successfully",
  "success": true
}
```

## Recommended Frontend Screen Flow

1. Doctor opens appointment list using `GET /api/appointments/doctor`.
2. Doctor taps an appointment.
3. If appointment has no consultation, call `POST /api/consultations/start`.
4. Store `consultationId`.
5. Show tabs or sections:
   - Symptoms
   - Investigations
   - Diagnoses
   - Medications
   - Follow-up
   - Notes
6. Each save button calls the matching `PATCH` endpoint.
7. Doctor taps complete, then call `PATCH /api/consultations/:id/complete`.
8. Show prescription using `GET /api/consultations/:id/rx`.

## Common Errors

### Doctor profile not found

The logged-in user has role `doctor`, but no doctor profile exists in the
`Doctor` collection.

### You can only start your own appointments

The appointment does not belong to the logged-in doctor's profile.

### Consultation can only be started for a registered patient appointment

The appointment was booked as a guest appointment and has no `patientId`.

### Completed consultations cannot be edited

The doctor already completed the consultation. Use the RX endpoint to view the
final record.

### Missing required field(s)

The request body is missing a required field. Check the endpoint-specific
required fields above.

