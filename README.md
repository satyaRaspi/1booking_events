# 1Booking v2.0

<<<<<<< HEAD
# Biometric Ticket Booking Website

This starter app includes:

- Python FastAPI backend
- React frontend
- JSON storage
- Event management
- Ticket class creation during event setup
- Seating layout management
- Seat booking with biometric capture demo
- Gate entry biometric verification demo
- Wallet / Face Pay demo

## Important Fix in This Version

The Seating Layout page now uses the ticket classes loaded during Event Management as the source of truth. The Generate / Replace Layout button now immediately refreshes and displays the visual layout preview after successful generation.

Example:

- Total tickets: 100
- Sponsor / FOC: 10
- Blocked: 5
- Sellable: 85
- VIP: 20
- Premium: 30
- General: 35

The seating layout will generate exactly 85 booking units and will follow the class quantities above.

## Easy Start on Windows

The project root includes two startup files:

```text
start_backend.bat
start_frontend.bat
```

After extracting the project to `C:\1booking`, double-click `start_backend.bat` first, then double-click `start_frontend.bat`.

## Backend Setup

Open Command Prompt:

```bat
cd C:\1booking\backend
python -m venv venv
venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app:app --reload
```

Backend runs at:

```text
http://127.0.0.1:8000
```

API docs:

```text
http://127.0.0.1:8000/docs
```

## Frontend Setup

Open a second Command Prompt:

```bat
cd C:\1booking\frontend
npm install
npm run dev
```

Frontend usually runs at:

```text
http://localhost:5173
```

## Recommended Flow

1. Open Events.
2. Create Test Data or create a new event.
3. Enter total tickets, FOC tickets, blocked tickets and number of classes.
4. Fill class quantities so class total equals sellable tickets.
5. Save event.
6. Open Seating Layout.
7. Select event.
8. Choose Circular, Gallery, No Seating or First Come First Serve.
9. Click Generate / Replace Layout.
10. Open Seat Booking and book seats.

## Notes

This is a prototype. The biometric signature generated in the browser is demo data. For production, use a proper face recognition engine, liveness detection, consent capture, encryption, audit logs and secure database storage.

## User Management

The app now supports two user categories:

- **Admin**: Access to Events, Seating Layout, Booking, Gate Entry, Face Pay, User Management and Admin Dashboard.
- **Audience**: Access only to the ticket booking page.

Default local admin login:

```text
Username: admin
Password: admin123
```

Admins can create new Admin or Audience users from the **Users** menu. Audience users can self-register using mobile number and basic profile details. Social handles such as Instagram and Facebook are captured as profile fields in this local demo; production social linking should use official OAuth consent flows.

## Latest Seat Booking Flow

The audience booking page now follows this flow:

1. Choose Event
2. Choose Date
3. Choose Time
4. Enter number of tickets
5. Select the same number of adjacent seats visually
6. Capture the purchaser biometric
7. Save and issue the ticket on screen
8. Download the generated ticket as a PDF

The PDF ticket includes the event, date, time, selected seat numbers, booking ID, biometric ID, and a biometric ticket QR reference. The QR stores the biometric/ticket reference, not the raw face image.

## 1Booking FaceID Biometric Engine Update

This version removes the old frontend random/demo biometric signature. The camera image is now sent to the Python backend, where a 1Booking FaceID-style biometric signature is generated.

Default engine included:
- OpenCV face detection + 128-dimensional face template fallback.

Optional stronger engine:
- If your Windows environment supports dlib, install `face_recognition==1.3.0` inside the backend venv. The backend will automatically use the `FACE_RECOGNITION_128D` engine first, and fall back to OpenCV only when `face_recognition` is not installed.

Important:
- Raw camera images are not saved during booking. The server stores only the generated biometric template/signature and hash.
- At gate entry, the live camera capture is again processed by the backend and compared with the stored ticket biometric template.
- If more than one face is detected, capture is rejected.


## Ticket Reissue PDF

The Admin **Tickets Sold** page now creates a physical PDF file whenever an admin clicks **Reissue** for a ticket.

Generated files are saved on the backend under:

```text
backend/generated_tickets/
```

The reissue popup and the ticket transaction table show a **Download** link after the PDF is created.

If you created the backend virtual environment before this update, run:

```bat
cd C:bookingackend
venv\Scriptsctivate
pip install -r requirements.txt
```

This installs the PDF generation dependency `reportlab`.
=======
# 1booking
events booking platform
>>>>>>> 9e2d3b7182cfd3e9b3ed62873451378dabae15ed
