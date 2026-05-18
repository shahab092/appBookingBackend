# Consultation / RX API Examples

All routes require `Authorization: Bearer <token>`.

## Start Consultation

`POST /api/consultations/start`

Doctor only.

```json
{
  "appointmentId": "665f4a9c8a4a111111111111"
}
```

## Get Consultation

`GET /api/consultations/:id`

Doctor or patient linked to the consultation.

## Add Symptom

`PATCH /api/consultations/:id/symptoms`

Doctor or patient.

```json
{
  "action": "add",
  "name": "Fever",
  "duration": "3 days",
  "severity": "moderate",
  "notes": "Worse at night"
}
```

## Update Symptom

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

## Delete Symptom

```json
{
  "action": "delete",
  "symptomId": "665f4b118a4a111111111111"
}
```

## Add Investigation

`PATCH /api/consultations/:id/investigations`

Doctor only.

```json
{
  "action": "add",
  "testName": "Complete Blood Count",
  "testType": "blood_test",
  "instructions": "Fasting not required"
}
```

## Update Investigation

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

## Delete Investigation

```json
{
  "action": "delete",
  "investigationId": "665f4b918a4a111111111111"
}
```

## Upload Investigation Result

`PATCH /api/consultations/:id/investigations/:investigationId/result`

Patient only.

Multipart form-data:

```text
resultFiles: report.pdf
resultNotes: CBC report attached. Hemoglobin is low.
```

JSON URL fallback:

```json
{
  "resultNotes": "Report uploaded from mobile app",
  "resultFiles": [
    {
      "fileName": "cbc-report.pdf",
      "fileUrl": "https://cdn.example.com/cbc-report.pdf",
      "mimeType": "application/pdf",
      "size": 245000
    }
  ]
}
```

## Add Diagnosis

`PATCH /api/consultations/:id/diagnoses`

Doctor only.

```json
{
  "action": "add",
  "diseaseName": "Viral upper respiratory infection",
  "diagnosisType": "final",
  "notes": "No signs of pneumonia"
}
```

## Update Diagnosis

```json
{
  "action": "update",
  "diagnosisId": "665f4bf98a4a111111111111",
  "diseaseName": "Acute bronchitis",
  "diagnosisType": "differential",
  "notes": "Review after CBC"
}
```

## Delete Diagnosis

```json
{
  "action": "delete",
  "diagnosisId": "665f4bf98a4a111111111111"
}
```

## Add Medication

`PATCH /api/consultations/:id/medications`

Doctor only.

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

## Update Medication

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

## Delete Medication

```json
{
  "action": "delete",
  "medicationId": "665f4c708a4a111111111111"
}
```

## Add Or Update Follow-Up

`PATCH /api/consultations/:id/follow-up`

Doctor only.

```json
{
  "followUpDate": "2026-05-24T10:00:00.000Z",
  "reason": "Review symptoms and CBC report",
  "instructions": "Return earlier if breathing difficulty develops"
}
```

## Add Note

`PATCH /api/consultations/:id/notes`

Doctor only.

```json
{
  "action": "add",
  "noteType": "instruction",
  "note": "Increase fluids and rest for 48 hours"
}
```

## Update Note

```json
{
  "action": "update",
  "noteId": "665f4cc28a4a111111111111",
  "noteType": "instruction",
  "note": "Increase fluids and monitor temperature"
}
```

## Delete Note

```json
{
  "action": "delete",
  "noteId": "665f4cc28a4a111111111111"
}
```

## Complete Consultation

`PATCH /api/consultations/:id/complete`

Doctor only.

```json
{}
```

## Get RX / Prescription

`GET /api/consultations/:id/rx`

Returns patient details, doctor details, appointment details, symptoms,
investigations/results, diagnoses, medications, follow-up, notes, and
consultation dates.
