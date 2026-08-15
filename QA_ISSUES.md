## BUG-001

**Severity:** High  
**Module:** Appointments  
**Role:** Administrator / BHW  
**Request:** appointment_transition  

**Steps to reproduce:**
1. Open a pending resident-requested appointment without assigned staff.
2. Choose Cancel or Reject.
3. Enter a valid reason.
4. Submit.

**Expected:**
The pending request is cancelled/rejected. Assigned staff is required only
before confirmation.

**Actual:**
Cancellation fails.

**Response JSON:**
```json
{
  "code": "23514",
  "message": "resident requests require assigned staff before confirmation"
}