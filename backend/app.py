from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import json
import uuid
import os
import shutil
from pathlib import Path
import hashlib
import base64
import io
import math
import hmac
from typing import List, Optional

try:
    import face_recognition
except Exception:
    face_recognition = None

try:
    import cv2
    import numpy as np
except Exception:
    cv2 = None
    np = None

try:
    import qrcode
except Exception:
    qrcode = None

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
except Exception:
    A4 = None
    mm = 1
    canvas = None
    ImageReader = None

app = FastAPI(title="Biometric Ticket Booking API", version="1.0.0")

allowed_origins_env = os.environ.get("ONEBOOKING_ALLOWED_ORIGINS", "")
allowed_origins = [
    origin.strip()
    for origin in allowed_origins_env.split(",")
    if origin.strip()
]
if not allowed_origins:
    # Local dev + same-origin Railway deployment. Use an explicit comma-separated
    # ONEBOOKING_ALLOWED_ORIGINS value for stricter production CORS.
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GENERATED_TICKET_DIR = os.path.join(os.path.dirname(__file__), "generated_tickets")
os.makedirs(GENERATED_TICKET_DIR, exist_ok=True)
app.mount("/generated_tickets", StaticFiles(directory=GENERATED_TICKET_DIR), name="generated_tickets")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Activity logs and abandoned-cart reports are stored outside the deploy/source folder by default.
# This keeps audit records available even after browser logout, frontend refreshes, and source replacements.
PERSISTENT_LOG_DIR = os.environ.get("ONEBOOKING_LOG_DIR") or os.path.join(os.path.expanduser("~"), "1booking_data")
os.makedirs(PERSISTENT_LOG_DIR, exist_ok=True)
PERSISTENT_LOG_FILES = {"user_activity_logs.json", "abandoned_carts.json"}

ONEFACEID_QR_SECRET = os.environ.get("ONEFACEID_QR_SECRET", "CHANGE-ME-LOCAL-DEMO-SECRET")

DEFAULT_FILES = {
    "events.json": [],
    "ticket_classes.json": [],
    "tickets.json": [],
    "biometric_store.json": [],
    "wallets.json": [],
    "transactions.json": [],
    "seats.json": [],
    "users.json": [],
    "workflow_biometrics.json": [],
    "workflow_config.json": {},
    "user_activity_logs.json": [],
    "abandoned_carts.json": [],
}

for filename, default in DEFAULT_FILES.items():
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as file:
            json.dump(default, file, indent=4)

# Ensure persistent log files exist, and migrate any existing backend/data logs once.
for filename in PERSISTENT_LOG_FILES:
    persistent_path = os.path.join(PERSISTENT_LOG_DIR, filename)
    source_path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(persistent_path):
        if os.path.exists(source_path) and os.path.getsize(source_path) > 2:
            shutil.copyfile(source_path, persistent_path)
        else:
            with open(persistent_path, "w", encoding="utf-8") as file:
                json.dump([], file, indent=4)


DEFAULT_WORKFLOW_CONFIG = {
    "biometric_enabled": True,
    "multiple_shows_enabled": True,
    "qr_ticket_enabled": True,
    "ticket_cancellation_enabled": True,
    "require_adjacent_seats": True,
    "demo_data_enabled": True,
    "updated_at": "",
}


def get_workflow_config():
    stored = read_json("workflow_config.json")
    if not isinstance(stored, dict) or not stored:
        config = {**DEFAULT_WORKFLOW_CONFIG, "updated_at": datetime.now().isoformat()}
        write_json("workflow_config.json", config)
        return config
    config = {**DEFAULT_WORKFLOW_CONFIG, **stored}
    return config


def save_workflow_config(config):
    next_config = {**DEFAULT_WORKFLOW_CONFIG, **config, "updated_at": datetime.now().isoformat()}
    write_json("workflow_config.json", next_config)
    return next_config


def data_path_for(filename):
    if filename in PERSISTENT_LOG_FILES:
        return os.path.join(PERSISTENT_LOG_DIR, filename)
    return os.path.join(DATA_DIR, filename)


def read_json(filename):
    path = data_path_for(filename)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as file:
        try:
            return json.load(file)
        except json.JSONDecodeError:
            return []


def write_json(filename, data):
    path = data_path_for(filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4)


def _decode_data_url_image(image_data: str):
    """Decode a browser data:image/...;base64 payload into image bytes."""
    if not image_data:
        raise ValueError("No image data received")
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    try:
        return base64.b64decode(image_data)
    except Exception as exc:
        raise ValueError("Invalid base64 image data") from exc


def _extract_signature_with_face_recognition(image_bytes: bytes):
    if face_recognition is None:
        return None
    image = face_recognition.load_image_file(io.BytesIO(image_bytes))
    locations = face_recognition.face_locations(image, model="hog")
    if len(locations) == 0:
        raise ValueError("No face detected. Please face the camera clearly.")
    if len(locations) > 1:
        raise ValueError("More than one face detected. Please capture only the purchaser.")
    encodings = face_recognition.face_encodings(image, known_face_locations=locations)
    if not encodings:
        raise ValueError("Face detected but encoding failed. Please retry with better lighting.")
    return [float(round(value, 6)) for value in encodings[0].tolist()], "FACE_RECOGNITION_128D", len(locations)


def _extract_signature_with_opencv_template(image_bytes: bytes):
    if cv2 is None or np is None:
        raise ValueError("No biometric engine available. Install face_recognition or opencv-python and numpy.")
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Unable to decode camera image")
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        raise ValueError("No face detected. Please face the camera clearly.")
    if len(faces) > 1:
        raise ValueError("More than one face detected. Please capture only the purchaser.")
    x, y, w, h = faces[0]
    face = gray[y:y+h, x:x+w]
    face = cv2.equalizeHist(face)
    face = cv2.resize(face, (16, 8), interpolation=cv2.INTER_AREA).astype("float32") / 255.0
    vector = face.flatten()
    vector = vector - float(np.mean(vector))
    norm = float(np.linalg.norm(vector)) or 1.0
    vector = vector / norm
    return [float(round(value, 6)) for value in vector.tolist()], "OPENCV_FACE_TEMPLATE_128D", len(faces)


def extract_face_signature(image_data: str):
    """
    1Booking FaceID-style backend biometric extraction.
    Preferred engine: face_recognition 128D encoding.
    Fallback engine: OpenCV detected face template converted to a 128D signature.
    The raw face image is not stored by the booking APIs; only this signature is persisted.
    """
    image_bytes = _decode_data_url_image(image_data)
    result = _extract_signature_with_face_recognition(image_bytes)
    if result is None:
        result = _extract_signature_with_opencv_template(image_bytes)
    signature, engine, face_count = result
    return {
        "signature": signature,
        "engine": engine,
        "face_count": face_count,
        "signature_hash": hashlib.sha256(json.dumps(signature).encode("utf-8")).hexdigest(),
    }


def resolve_face_signature(signature, image_data):
    """Resolve a 1Booking FaceID biometric signature.

    Important: when the browser sends both the captured image and a signature,
    always re-extract from the image on the backend. Earlier builds accepted the
    client-supplied signature first and stored the engine as CLIENT_SUPPLIED,
    which made gate/reverse matching use the wrong threshold and caused FaceID
    resolution failures. The backend must remain the source of truth.
    """
    if image_data:
        extracted = extract_face_signature(image_data)
        return extracted["signature"], extracted["engine"], extracted["signature_hash"]
    if signature and len(signature) >= 4:
        clean_signature = [float(value) for value in signature]
        return clean_signature, "CLIENT_SUPPLIED_128D", hashlib.sha256(json.dumps(clean_signature).encode("utf-8")).hexdigest()
    raise ValueError("Valid biometric face capture is required")


def _canonical_json(data):
    return json.dumps(data, separators=(",", ":"), sort_keys=True, ensure_ascii=False)


def _sign_payload(payload):
    return hmac.new(
        ONEFACEID_QR_SECRET.encode("utf-8"),
        _canonical_json(payload).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def make_1faceid_qr_payload(*, biometric_id, booking_group_id, ticket_ids, event, buyer_name, buyer_mobile, face_signature, signature_engine, signature_hash):
    """Create the 1Booking FaceID-style QR payload.

    This intentionally stores a biometric template/reference, not the raw face image.
    The HMAC lets the backend detect if a QR payload has been tampered with.
    """
    payload = {
        "schema": "1BOOKING_FACEID_TICKET_QR",
        "version": "1.0",
        "biometric_id": biometric_id,
        "booking_group_id": booking_group_id,
        "ticket_ids": ticket_ids,
        "event_id": (event or {}).get("event_id", ""),
        "event_name": (event or {}).get("event_name", ""),
        "event_date": (event or {}).get("event_date", ""),
        "event_time": (event or {}).get("event_time", ""),
        "buyer_name": buyer_name,
        "buyer_mobile": buyer_mobile,
        "signature_engine": signature_engine,
        "face_signature_hash": signature_hash,
        "face_signature": [round(float(value), 6) for value in (face_signature or [])],
        "created_at": datetime.now().isoformat(),
    }
    envelope = {
        "payload": payload,
        "signature": _sign_payload(payload),
    }
    return _canonical_json(envelope)


def make_qr_data_url(payload_text: str):
    if qrcode is None:
        return ""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=4,
    )
    qr.add_data(payload_text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")



def _safe_pdf_text(value, max_len=90):
    text = str(value or "")
    return text[:max_len]


def create_ticket_pdf_file(issued_ticket: dict):
    """Create a physical PDF file for a reissued 1Booking FaceID ticket and return its URL."""
    if canvas is None:
        raise RuntimeError("PDF generation dependency is unavailable. Please install reportlab.")

    reissue_id = issued_ticket.get("reissue_id") or "REISSUE"
    ticket_id = issued_ticket.get("ticket_id") or "TICKET"
    filename = f"reissued_ticket_{ticket_id}_{reissue_id}.pdf".replace("/", "_").replace("\\", "_")
    file_path = os.path.join(GENERATED_TICKET_DIR, filename)

    c = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4

    # Border and title
    c.setLineWidth(1.4)
    c.roundRect(14 * mm, 16 * mm, width - 28 * mm, height - 32 * mm, 6 * mm, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(24 * mm, height - 32 * mm, "Reissued 1Booking Event Ticket")
    c.setFont("Helvetica", 10)
    c.drawString(24 * mm, height - 39 * mm, "Biometric ticket QR linked to the purchaser identity")

    # QR image
    qr_data_url = issued_ticket.get("qr_data_url") or ""
    if qr_data_url.startswith("data:image") and "," in qr_data_url and ImageReader is not None:
        try:
            qr_bytes = base64.b64decode(qr_data_url.split(",", 1)[1])
            qr_buffer = io.BytesIO(qr_bytes)
            c.drawImage(ImageReader(qr_buffer), width - 78 * mm, height - 84 * mm, 48 * mm, 48 * mm, preserveAspectRatio=True, mask="auto")
            c.setFont("Helvetica", 7)
            c.drawCentredString(width - 54 * mm, height - 88 * mm, "1Booking FaceID QR")
        except Exception:
            c.setFont("Helvetica", 9)
            c.drawString(width - 78 * mm, height - 56 * mm, "QR unavailable")

    # Details grid
    rows = [
        ("Event", issued_ticket.get("event_name")),
        ("Venue", f"{issued_ticket.get('venue', '')}{', ' + issued_ticket.get('city', '') if issued_ticket.get('city') else ''}"),
        ("Date", issued_ticket.get("event_date")),
        ("Time", issued_ticket.get("event_time")),
        ("Purchaser", issued_ticket.get("buyer_name")),
        ("Mobile", issued_ticket.get("buyer_mobile")),
        ("Seat", ", ".join(issued_ticket.get("seat_numbers") or [])),
        ("Ticket ID", issued_ticket.get("ticket_id")),
        ("Booking ID", issued_ticket.get("booking_group_id")),
        ("Biometric ID", issued_ticket.get("biometric_id")),
        ("Reissue ID", issued_ticket.get("reissue_id")),
        ("Reissued At", issued_ticket.get("reissued_at")),
        ("QR Format", issued_ticket.get("qr_format") or "1BOOKING_FACEID_TICKET_QR_V1"),
    ]

    y = height - 58 * mm
    c.setFont("Helvetica", 9)
    for label, value in rows:
        c.setFillColorRGB(0.38, 0.42, 0.48)
        c.drawString(24 * mm, y, label)
        c.setFillColorRGB(0.06, 0.09, 0.16)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(58 * mm, y, _safe_pdf_text(value))
        c.setFont("Helvetica", 9)
        y -= 8 * mm

    c.setFillColorRGB(0.38, 0.42, 0.48)
    c.setFont("Helvetica", 8)
    c.drawString(24 * mm, 31 * mm, "This PDF was generated by the admin reissue function. Validate entry using the biometric gate verification flow.")
    c.drawString(24 * mm, 25 * mm, "The QR carries a signed ticket/biometric reference and does not store the raw face image.")

    c.showPage()
    c.save()

    return {
        "pdf_filename": filename,
        "pdf_path": file_path,
        "pdf_url": f"/generated_tickets/{filename}",
        "pdf_download_url": f"http://127.0.0.1:8000/generated_tickets/{filename}",
    }


def verify_1faceid_qr_payload(payload_text: str):
    try:
        envelope = json.loads(payload_text)
        payload = envelope.get("payload") or {}
        supplied = envelope.get("signature") or ""
        expected = _sign_payload(payload)
        return hmac.compare_digest(supplied, expected), payload
    except Exception:
        return False, {}



class EventTicketClassInput(BaseModel):
    class_name: str
    price: float = 0
    quantity: int = 0
    benefits: str = ""
    seating_mode: str = "ASSIGNED_SEAT"


class ShowScheduleInput(BaseModel):
    show_date: str = ""
    show_time: str = ""
    doors_open_time: Optional[str] = ""
    duration_minutes: Optional[int] = 0
    status: Optional[str] = "ACTIVE"


class EventCreate(BaseModel):
    event_name: str
    event_type: Optional[str] = "Concert"
    artist_name: Optional[str] = ""
    production_company: Optional[str] = ""
    organizer_name: Optional[str] = ""

    venue: str
    address_line1: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    country: Optional[str] = ""
    pincode: Optional[str] = ""
    latitude: Optional[str] = ""
    longitude: Optional[str] = ""

    event_date: Optional[str] = ""
    event_time: Optional[str] = ""
    doors_open_time: Optional[str] = ""
    duration_minutes: Optional[int] = 0
    show_schedules: Optional[List[ShowScheduleInput]] = []

    total_tickets: Optional[int] = 0
    number_of_classes: Optional[int] = 0
    ticket_classes: Optional[List[EventTicketClassInput]] = None
    sponsor_foc_tickets: Optional[int] = 0
    blocked_tickets: Optional[int] = 0

    sale_start_date: Optional[str] = ""
    sale_end_date: Optional[str] = ""
    age_restriction: Optional[str] = ""
    description: Optional[str] = ""
    terms: Optional[str] = ""
    status: Optional[str] = "ACTIVE"
    poster_image: Optional[str] = ""
    poster_name: Optional[str] = ""
    highlight_tags: Optional[List[str]] = []


class EventUpdate(EventCreate):
    pass


class TicketClassCreate(BaseModel):
    class_name: str
    price: float
    quantity: int
    benefits: str = ""


class SeatLayoutCreate(BaseModel):
    event_id: str
    layout_type: Optional[str] = "gallery"
    vip_rows: Optional[int] = 2
    vip_seats_per_row: Optional[int] = 10
    premium_rows: Optional[int] = 2
    premium_seats_per_row: Optional[int] = 12
    general_rows: Optional[int] = 2
    general_seats_per_row: Optional[int] = 14
    vip_price: Optional[float] = 5000
    premium_price: Optional[float] = 2500
    general_price: Optional[float] = 1000
    no_seating_classes: Optional[List[str]] = []
    first_come_classes: Optional[List[str]] = []
    class_capacity: Optional[dict] = None
    class_prices: Optional[dict] = None


class SeatBooking(BaseModel):
    event_id: str
    seat_id: Optional[str] = None
    seat_ids: Optional[List[str]] = None
    event_date: Optional[str] = ""
    event_time: Optional[str] = ""
    buyer_name: str
    buyer_mobile: str
    face_signature: Optional[List[float]] = None
    face_image_data: Optional[str] = None


class GateVerification(BaseModel):
    event_id: str
    live_face_signature: Optional[List[float]] = None
    live_face_image_data: Optional[str] = None


class WalletTopup(BaseModel):
    biometric_id: str
    amount: float


class FacePurchase(BaseModel):
    live_face_signature: Optional[List[float]] = None
    live_face_image_data: Optional[str] = None
    amount: float
    description: str


class WorkflowConfigUpdate(BaseModel):
    biometric_enabled: Optional[bool] = True
    multiple_shows_enabled: Optional[bool] = True
    qr_ticket_enabled: Optional[bool] = True
    ticket_cancellation_enabled: Optional[bool] = True
    require_adjacent_seats: Optional[bool] = True
    demo_data_enabled: Optional[bool] = True


class BiometricExtractRequest(BaseModel):
    image_data: str


class BiometricReverseLookupRequest(BaseModel):
    event_id: Optional[str] = None
    face_signature: Optional[List[float]] = None
    face_image_data: Optional[str] = None


class WorkflowFaceEnrollRequest(BaseModel):
    name: str
    age: int
    face_signature: Optional[List[float]] = None
    face_image_data: Optional[str] = None


class WorkflowFaceLookupRequest(BaseModel):
    face_signature: Optional[List[float]] = None
    face_image_data: Optional[str] = None





class UserActivityLogRequest(BaseModel):
    user_id: Optional[str] = ""
    username: Optional[str] = ""
    full_name: Optional[str] = ""
    mobile: Optional[str] = ""
    role: Optional[str] = ""
    action: str
    page: Optional[str] = ""
    event_id: Optional[str] = ""
    event_name: Optional[str] = ""
    details: Optional[dict] = {}


class AbandonedCartRequest(BaseModel):
    cart_id: str
    user_id: Optional[str] = ""
    username: Optional[str] = ""
    full_name: Optional[str] = ""
    mobile: Optional[str] = ""
    event_id: Optional[str] = ""
    event_name: Optional[str] = ""
    event_date: Optional[str] = ""
    event_time: Optional[str] = ""
    ticket_count: Optional[int] = 0
    selected_seats: Optional[List[str]] = []
    amount: Optional[float] = 0
    step: Optional[str] = ""
    status: Optional[str] = "IN_PROGRESS"
    reason: Optional[str] = ""

def append_user_activity(action, *, user_id="", username="", full_name="", mobile="", role="", page="", event_id="", event_name="", details=None):
    logs = read_json("user_activity_logs.json")
    if not isinstance(logs, list):
        logs = []
    entry = {
        "log_id": "LOG" + uuid.uuid4().hex[:10].upper(),
        "timestamp": datetime.now().isoformat(),
        "user_id": user_id or "",
        "username": username or "",
        "full_name": full_name or "",
        "mobile": mobile or "",
        "role": role or "",
        "action": action,
        "page": page or "",
        "event_id": event_id or "",
        "event_name": event_name or "",
        "details": details or {},
    }
    logs.append(entry)
    # Keep the local demo log from growing forever.
    logs = logs[-5000:]
    write_json("user_activity_logs.json", logs)
    return entry


def upsert_abandoned_cart_record(payload: dict):
    carts = read_json("abandoned_carts.json")
    if not isinstance(carts, list):
        carts = []
    cart_id = payload.get("cart_id") or ("CART" + uuid.uuid4().hex[:10].upper())
    now = datetime.now().isoformat()
    existing = next((item for item in carts if item.get("cart_id") == cart_id), None)
    record = {
        "cart_id": cart_id,
        "user_id": payload.get("user_id", ""),
        "username": payload.get("username", ""),
        "full_name": payload.get("full_name", ""),
        "mobile": payload.get("mobile", ""),
        "event_id": payload.get("event_id", ""),
        "event_name": payload.get("event_name", ""),
        "event_date": payload.get("event_date", ""),
        "event_time": payload.get("event_time", ""),
        "ticket_count": int(payload.get("ticket_count") or 0),
        "selected_seats": payload.get("selected_seats") or [],
        "amount": float(payload.get("amount") or 0),
        "step": payload.get("step", ""),
        "status": payload.get("status", "IN_PROGRESS"),
        "reason": payload.get("reason", ""),
        "updated_at": now,
    }
    if existing:
        record["created_at"] = existing.get("created_at", now)
        existing.update(record)
    else:
        record["created_at"] = now
        carts.append(record)
    carts = carts[-5000:]
    write_json("abandoned_carts.json", carts)
    return record


@app.post("/analytics/log")
def create_user_activity_log(request: UserActivityLogRequest):
    entry = append_user_activity(
        request.action,
        user_id=request.user_id,
        username=request.username,
        full_name=request.full_name,
        mobile=request.mobile,
        role=request.role,
        page=request.page,
        event_id=request.event_id,
        event_name=request.event_name,
        details=request.details,
    )
    return {"status": "SUCCESS", "message": "Activity logged", "log": entry}


@app.post("/analytics/cart")
def save_abandoned_cart(request: AbandonedCartRequest):
    record = upsert_abandoned_cart_record(request.dict())
    if record.get("status") == "ABANDONED":
        append_user_activity(
            "CART_ABANDONED",
            user_id=record.get("user_id", ""),
            username=record.get("username", ""),
            full_name=record.get("full_name", ""),
            mobile=record.get("mobile", ""),
            role="AUDIENCE",
            page="SeatBookingPage",
            event_id=record.get("event_id", ""),
            event_name=record.get("event_name", ""),
            details=record,
        )
    return {"status": "SUCCESS", "message": "Cart activity saved", "cart": record}


@app.get("/admin/user-activity")
def admin_user_activity(user_id: Optional[str] = Query(default=None), action: Optional[str] = Query(default=None), limit: int = Query(default=300)):
    logs = read_json("user_activity_logs.json")
    if not isinstance(logs, list):
        logs = []
    rows = logs
    if user_id:
        rows = [item for item in rows if item.get("user_id") == user_id or item.get("username") == user_id]
    if action:
        rows = [item for item in rows if item.get("action") == action]
    rows = sorted(rows, key=lambda item: item.get("timestamp", ""), reverse=True)[:limit]
    return {"status": "SUCCESS", "count": len(rows), "logs": rows}




@app.get("/admin/log-storage-info")
def admin_log_storage_info():
    return {
        "status": "SUCCESS",
        "message": "Activity logs are stored in the persistent 1Booking log folder.",
        "log_directory": PERSISTENT_LOG_DIR,
        "files": sorted(list(PERSISTENT_LOG_FILES)),
    }

@app.get("/admin/abandoned-carts")
def admin_abandoned_carts(status: Optional[str] = Query(default="ABANDONED"), limit: int = Query(default=300)):
    carts = read_json("abandoned_carts.json")
    if not isinstance(carts, list):
        carts = []
    rows = carts
    if status and status != "ALL":
        rows = [item for item in rows if item.get("status") == status]
    rows = sorted(rows, key=lambda item: item.get("updated_at", ""), reverse=True)[:limit]
    total_value = sum(float(item.get("amount") or 0) for item in rows)
    return {"status": "SUCCESS", "count": len(rows), "total_value": total_value, "carts": rows}


@app.get("/config")
def get_config_endpoint():
    return get_workflow_config()


@app.put("/config")
def put_config_endpoint(request: WorkflowConfigUpdate):
    config = save_workflow_config(request.dict(exclude_none=True))
    return {"status": "SUCCESS", "message": "Workflow configuration saved successfully.", "config": config}


@app.patch("/config")
def patch_config_endpoint(request: WorkflowConfigUpdate):
    current = get_workflow_config()
    updates = request.dict(exclude_none=True)
    config = save_workflow_config({**current, **updates})
    return {"status": "SUCCESS", "message": "Workflow configuration updated successfully.", "config": config}


@app.get("/workflow-faceid/records")
def list_workflow_faceid_records():
    records = read_json("workflow_biometrics.json")
    clean_records = []
    for record in records:
        item = dict(record)
        item.pop("face_signature", None)
        clean_records.append(item)
    return {"status": "SUCCESS", "records": clean_records}


@app.post("/workflow-faceid/enroll")
def workflow_faceid_enroll(request: WorkflowFaceEnrollRequest):
    if not request.name.strip():
        return {"status": "FAILED", "message": "Name is required"}
    if request.age <= 0:
        return {"status": "FAILED", "message": "Valid age is required"}

    try:
        face_signature, signature_engine, signature_hash = resolve_face_signature(
            request.face_signature,
            request.face_image_data,
        )
    except ValueError as exc:
        return {"status": "FAILED", "message": str(exc)}

    records = read_json("workflow_biometrics.json")
    record = {
        "workflow_faceid": "WFID" + uuid.uuid4().hex[:8].upper(),
        "name": request.name.strip(),
        "age": int(request.age),
        "face_signature": face_signature,
        "signature_engine": signature_engine,
        "face_signature_hash": signature_hash,
        "created_at": datetime.now().isoformat(),
        "status": "ACTIVE",
        "logic": "1Booking FaceID-style single-face capture + 128D template + threshold match",
    }
    records.append(record)
    write_json("workflow_biometrics.json", records)

    public_record = dict(record)
    public_record.pop("face_signature", None)
    return {
        "status": "SUCCESS",
        "message": "1Booking FaceID biometric record saved successfully",
        "record": public_record,
    }


@app.post("/workflow-faceid/lookup")
def workflow_faceid_lookup(request: WorkflowFaceLookupRequest):
    try:
        live_signature, live_engine, live_hash = resolve_face_signature(
            request.face_signature,
            request.face_image_data,
        )
    except ValueError as exc:
        return {"status": "FAILED", "message": str(exc)}

    records = [record for record in read_json("workflow_biometrics.json") if record.get("status") == "ACTIVE"]
    if not records:
        return {"status": "FAILED", "message": "No 1Booking FaceID workflow records are enrolled yet."}

    best_record = None
    best_distance = 999
    best_threshold = 0.55
    for record in records:
        distance = calculate_distance(record.get("face_signature"), live_signature)
        threshold = match_threshold_for_engine(record.get("signature_engine") or live_engine)
        if distance < best_distance:
            best_distance = distance
            best_threshold = threshold
            best_record = record

    if not best_record or best_distance > best_threshold:
        return {
            "status": "FAILED",
            "message": "No matching 1Booking FaceID record found.",
            "match_score": best_distance,
            "threshold": best_threshold,
        }

    public_record = dict(best_record)
    public_record.pop("face_signature", None)
    return {
        "status": "SUCCESS",
        "message": "Face matched successfully.",
        "match_score": best_distance,
        "threshold": best_threshold,
        "record": public_record,
        "live_signature_hash": live_hash,
    }


@app.post("/biometric/extract")
def biometric_extract(request: BiometricExtractRequest):
    try:
        extracted = extract_face_signature(request.image_data)
        return {
            "status": "SUCCESS",
            "message": "Face biometric captured successfully",
            "face_signature": extracted["signature"],
            "signature_engine": extracted["engine"],
            "face_count": extracted["face_count"],
            "signature_hash": extracted["signature_hash"],
        }
    except ValueError as exc:
        return {"status": "FAILED", "message": str(exc)}



VALID_ROLES = ["ADMIN", "SUPER_USER", "SALES", "AUDIENCE"]

PAGE_CATALOG = [
    {"id": "events", "label": "Events"},
    {"id": "layout", "label": "Seating Layout"},
    {"id": "booking", "label": "Seat Booking"},
    {"id": "ticketsSold", "label": "Tickets Sold"},
    {"id": "gate", "label": "Gate Entry"},
    {"id": "reverse", "label": "Face to QR"},
    {"id": "workflowFaceID", "label": "FaceID Workflow"},
    {"id": "pay", "label": "Face Pay"},
    {"id": "users", "label": "Users"},
    {"id": "config", "label": "Configuration"},
    {"id": "analytics", "label": "Reports"},
    {"id": "activityLogs", "label": "Activity Logs"},
    {"id": "admin", "label": "Admin"},
    {"id": "myBookings", "label": "My Bookings"},
]
VALID_PAGE_IDS = {page["id"] for page in PAGE_CATALOG}

ROLE_DEFAULT_ACCESS = {
    "ADMIN": [page["id"] for page in PAGE_CATALOG],
    "SUPER_USER": ["events", "layout", "booking", "ticketsSold", "gate", "reverse", "workflowFaceID", "pay", "analytics", "activityLogs", "admin"],
    "SALES": ["booking", "ticketsSold", "events", "analytics"],
    "AUDIENCE": ["booking", "myBookings"],
}

def normalize_role(role: str) -> str:
    return str(role or "AUDIENCE").upper()

def sanitize_access_pages(access_pages, role: str):
    role = normalize_role(role)
    if not access_pages:
        return list(ROLE_DEFAULT_ACCESS.get(role, ROLE_DEFAULT_ACCESS["AUDIENCE"]))
    cleaned = []
    for page in access_pages:
        page_id = str(page or "").strip()
        if page_id in VALID_PAGE_IDS and page_id not in cleaned:
            cleaned.append(page_id)
    if not cleaned:
        cleaned = list(ROLE_DEFAULT_ACCESS.get(role, ROLE_DEFAULT_ACCESS["AUDIENCE"]))
    return cleaned

@app.get("/access-pages")
def get_access_pages():
    return {"roles": VALID_ROLES, "pages": PAGE_CATALOG, "role_defaults": ROLE_DEFAULT_ACCESS}

class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    full_name: str
    mobile: str = ""
    email: str = ""
    username: str = ""
    password: str
    role: str = "AUDIENCE"
    status: str = "ACTIVE"
    city: str = ""
    state: str = ""
    country: str = ""
    date_of_birth: str = ""
    gender: str = ""
    instagram: str = ""
    facebook: str = ""
    interests: List[str] = []
    consent_social_linking: bool = False
    consent_biometric_ticketing: bool = False
    access_pages: List[str] = []


class AudienceRegister(BaseModel):
    full_name: str
    mobile: str
    email: str = ""
    username: str = ""
    password: str
    city: str = ""
    state: str = ""
    country: str = "India"
    date_of_birth: str = ""
    gender: str = ""
    instagram: str = ""
    facebook: str = ""
    interests: List[str] = []
    consent_social_linking: bool = False
    consent_biometric_ticketing: bool = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    interests: Optional[List[str]] = None
    consent_social_linking: Optional[bool] = None
    consent_biometric_ticketing: Optional[bool] = None
    access_pages: Optional[List[str]] = None


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def public_user(user):
    clean = dict(user)
    clean.pop("password_hash", None)
    clean["role"] = normalize_role(clean.get("role"))
    clean["access_pages"] = sanitize_access_pages(clean.get("access_pages"), clean.get("role"))
    return clean


def normalize_mobile(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def default_username_from_mobile(username: str, mobile: str) -> str:
    clean_username = str(username or "").strip()
    clean_mobile = normalize_mobile(mobile)
    return clean_username or clean_mobile


def ensure_default_admin():
    users = read_json("users.json")
    if any(user.get("role") == "ADMIN" for user in users):
        return
    admin = {
        "user_id": "USRADMIN",
        "full_name": "System Administrator",
        "mobile": "",
        "email": "admin@local.app",
        "username": "admin",
        "password_hash": hash_password("admin123"),
        "role": "ADMIN",
        "access_pages": ROLE_DEFAULT_ACCESS["ADMIN"],
        "status": "ACTIVE",
        "city": "",
        "state": "",
        "country": "India",
        "date_of_birth": "",
        "gender": "",
        "instagram": "",
        "facebook": "",
        "interests": [],
        "consent_social_linking": False,
        "consent_biometric_ticketing": True,
        "created_at": datetime.now().isoformat(),
        "created_by": "SYSTEM",
    }
    users.append(admin)
    write_json("users.json", users)


ensure_default_admin()


@app.get("/api/health")
def health():
    return {"status": "OK", "message": "1Booking API is running"}






@app.post("/biometric/reverse-lookup")
def biometric_reverse_lookup(request: BiometricReverseLookupRequest):
    """Reverse lookup: capture a live face and return the linked 1Booking FaceID QR.

    This is restricted to the app's enrolled ticket biometrics and returns the
    QR/ticket reference for a matched purchaser. It does not reconstruct a face
    image from the biometric template.
    """
    try:
        live_signature, live_engine, live_hash = resolve_face_signature(request.face_signature, request.face_image_data)
    except ValueError as exc:
        return {"status": "FAILED", "message": str(exc)}

    biometrics = read_json("biometric_store.json")
    tickets = read_json("tickets.json")
    best = None
    best_distance = 999
    best_threshold = 0.55

    for biometric in biometrics:
        linked_ticket_ids = set(biometric.get("linked_ticket_ids") or [])
        linked_tickets = [ticket for ticket in tickets if ticket.get("ticket_id") in linked_ticket_ids]
        if request.event_id and not any(ticket.get("event_id") == request.event_id for ticket in linked_tickets):
            continue
        distance = calculate_distance(biometric.get("face_signature"), live_signature)
        threshold = match_threshold_for_engine(biometric.get("signature_engine") or live_engine)
        if distance < best_distance:
            best_distance = distance
            best_threshold = threshold
            best = (biometric, linked_tickets)

    if not best or best_distance > best_threshold:
        return {
            "status": "FAILED",
            "message": "No enrolled 1Booking FaceID biometric matched this face.",
            "match_score": best_distance,
            "threshold": best_threshold,
        }

    biometric, linked_tickets = best
    return {
        "status": "SUCCESS",
        "message": "Face matched. 1Booking FaceID QR recovered.",
        "match_score": best_distance,
        "threshold": best_threshold,
        "biometric_id": biometric.get("biometric_id"),
        "booking_group_id": biometric.get("booking_group_id"),
        "qr_payload": biometric.get("qr_payload"),
        "qr_data_url": biometric.get("qr_data_url"),
        "signature_engine": biometric.get("signature_engine"),
        "face_signature_hash": biometric.get("face_signature_hash"),
        "tickets": linked_tickets,
    }


@app.post("/auth/login")
def login(request: UserLogin):
    users = read_json("users.json")
    user = next((u for u in users if u.get("username", "").lower() == request.username.lower()), None)
    if not user or user.get("password_hash") != hash_password(request.password):
        return {"status": "FAILED", "message": "Invalid username or password"}
    if user.get("status") != "ACTIVE":
        return {"status": "FAILED", "message": "User is not active"}
    return {"status": "SUCCESS", "message": "Login successful", "user": public_user(user)}


@app.post("/auth/register-audience")
def register_audience(request: AudienceRegister):
    users = read_json("users.json")
    mobile = normalize_mobile(request.mobile)
    username = default_username_from_mobile(request.username, mobile)
    if not mobile:
        return {"status": "FAILED", "message": "Mobile number is required because username defaults to mobile"}
    if any(u.get("username", "").lower() == username.lower() for u in users):
        return {"status": "FAILED", "message": "Username/mobile already exists"}
    if any(normalize_mobile(u.get("mobile")) == mobile for u in users):
        return {"status": "FAILED", "message": "Mobile number already registered"}
    user = {
        "user_id": "USR" + uuid.uuid4().hex[:8].upper(),
        "full_name": request.full_name,
        "mobile": mobile,
        "email": request.email,
        "username": username,
        "password_hash": hash_password(request.password),
        "role": "AUDIENCE",
        "access_pages": ROLE_DEFAULT_ACCESS["AUDIENCE"],
        "status": "ACTIVE",
        "city": request.city,
        "state": request.state,
        "country": request.country,
        "date_of_birth": request.date_of_birth,
        "gender": request.gender,
        "instagram": request.instagram,
        "facebook": request.facebook,
        "interests": request.interests,
        "consent_social_linking": request.consent_social_linking,
        "consent_biometric_ticketing": request.consent_biometric_ticketing,
        "created_at": datetime.now().isoformat(),
        "created_by": "SELF_REGISTRATION",
    }
    users.append(user)
    write_json("users.json", users)
    return {"status": "SUCCESS", "message": "Audience account created", "user": public_user(user)}


@app.get("/users")
def list_users():
    users = read_json("users.json")
    return [public_user(user) for user in users]


@app.post("/users")
def create_user(request: UserCreate):
    users = read_json("users.json")
    role = normalize_role(request.role)
    mobile = normalize_mobile(request.mobile)
    username = default_username_from_mobile(request.username, mobile)
    if role not in VALID_ROLES:
        return {"status": "FAILED", "message": "Role must be ADMIN, SUPER_USER, SALES, or AUDIENCE"}
    if not mobile:
        return {"status": "FAILED", "message": "Mobile number is required because username defaults to mobile"}
    if any(u.get("username", "").lower() == username.lower() for u in users):
        return {"status": "FAILED", "message": "Username/mobile already exists"}
    if any(normalize_mobile(u.get("mobile")) == mobile for u in users):
        return {"status": "FAILED", "message": "Mobile number already registered"}
    user = {
        "user_id": "USR" + uuid.uuid4().hex[:8].upper(),
        "full_name": request.full_name,
        "mobile": mobile,
        "email": request.email,
        "username": username,
        "password_hash": hash_password(request.password),
        "role": role,
        "access_pages": sanitize_access_pages(request.access_pages, role),
        "status": request.status.upper() if hasattr(request, "status") and getattr(request, "status", None) else "ACTIVE",
        "city": request.city,
        "state": request.state,
        "country": request.country,
        "date_of_birth": request.date_of_birth,
        "gender": request.gender,
        "instagram": request.instagram,
        "facebook": request.facebook,
        "interests": request.interests,
        "consent_social_linking": request.consent_social_linking,
        "consent_biometric_ticketing": request.consent_biometric_ticketing,
        "created_at": datetime.now().isoformat(),
        "created_by": "ADMIN",
    }
    users.append(user)
    write_json("users.json", users)
    return {"status": "SUCCESS", "message": "User created", "user": public_user(user)}


@app.patch("/users/{user_id}")
def update_user(user_id: str, request: UserUpdate):
    users = read_json("users.json")
    user = next((u for u in users if u.get("user_id") == user_id), None)
    if not user:
        return {"status": "FAILED", "message": "User not found"}

    updates = request.dict(exclude_unset=True)

    if "mobile" in updates:
        updates["mobile"] = normalize_mobile(updates.get("mobile"))
        if not updates["mobile"]:
            return {"status": "FAILED", "message": "Mobile number is required because username defaults to mobile"}
        old_mobile = normalize_mobile(user.get("mobile"))
        current_username = str(user.get("username") or "")
        requested_username = str(updates.get("username") or "").strip()
        if not requested_username or current_username == old_mobile:
            updates["username"] = updates["mobile"]

    if user_id == "USRADMIN" and updates.get("status") == "INACTIVE":
        return {"status": "FAILED", "message": "Default admin cannot be made inactive"}

    if "role" in updates and updates["role"]:
        updates["role"] = normalize_role(updates["role"])
        if updates["role"] not in VALID_ROLES:
            return {"status": "FAILED", "message": "Role must be ADMIN, SUPER_USER, SALES, or AUDIENCE"}

    if "status" in updates and updates["status"]:
        updates["status"] = updates["status"].upper()
        if updates["status"] not in ["ACTIVE", "INACTIVE"]:
            return {"status": "FAILED", "message": "Status must be ACTIVE or INACTIVE"}

    if updates.get("username"):
        wanted = updates["username"].lower()
        if any(u.get("user_id") != user_id and u.get("username", "").lower() == wanted for u in users):
            return {"status": "FAILED", "message": "Username already exists"}

    if updates.get("mobile"):
        if any(u.get("user_id") != user_id and normalize_mobile(u.get("mobile")) == updates["mobile"] for u in users):
            return {"status": "FAILED", "message": "Mobile number already registered"}

    if updates.get("password"):
        user["password_hash"] = hash_password(updates.pop("password"))
    elif "password" in updates:
        updates.pop("password")

    if "access_pages" in updates:
        target_role = updates.get("role") or user.get("role")
        updates["access_pages"] = sanitize_access_pages(updates.get("access_pages"), target_role)
    elif "role" in updates:
        updates["access_pages"] = sanitize_access_pages([], updates.get("role"))

    user.update(updates)
    user["updated_at"] = datetime.now().isoformat()
    write_json("users.json", users)
    return {"status": "SUCCESS", "message": "User updated", "user": public_user(user)}


@app.post("/users/{user_id}/activate")
def activate_user(user_id: str):
    users = read_json("users.json")
    user = next((u for u in users if u.get("user_id") == user_id), None)
    if not user:
        return {"status": "FAILED", "message": "User not found"}
    user["status"] = "ACTIVE"
    user["updated_at"] = datetime.now().isoformat()
    write_json("users.json", users)
    return {"status": "SUCCESS", "message": "User activated", "user": public_user(user)}


@app.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: str):
    if user_id == "USRADMIN":
        return {"status": "FAILED", "message": "Default admin cannot be deactivated"}
    users = read_json("users.json")
    user = next((u for u in users if u.get("user_id") == user_id), None)
    if not user:
        return {"status": "FAILED", "message": "User not found"}
    user["status"] = "INACTIVE"
    user["updated_at"] = datetime.now().isoformat()
    write_json("users.json", users)
    return {"status": "SUCCESS", "message": "User deactivated", "user": public_user(user)}


@app.delete("/users/{user_id}")
def delete_user(user_id: str):
    if user_id == "USRADMIN":
        return {"status": "FAILED", "message": "Default admin cannot be deleted"}
    users = read_json("users.json")
    original_count = len(users)
    users = [u for u in users if u.get("user_id") != user_id]
    if len(users) == original_count:
        return {"status": "FAILED", "message": "User not found"}
    write_json("users.json", users)
    return {"status": "SUCCESS", "message": "User deleted"}


@app.post("/seed-demo")
def seed_demo():
    if not get_workflow_config().get("demo_data_enabled", True):
        return {"status": "FAILED", "message": "Demo data creation is disabled in workflow configuration."}

    """Create one additional demo event every time this endpoint is called.

    Earlier versions reused EVTDEMO01 and overwrote JSON files, so only one
    test event could exist. This version appends fresh records with unique IDs.
    """
    events = read_json("events.json")
    ticket_classes = read_json("ticket_classes.json")
    seats = read_json("seats.json")

    demo_number = sum(1 for event in events if str(event.get("event_id", "")).startswith("EVTDEMO")) + 1
    suffix = f"{demo_number:03d}"
    event_id = f"EVTDEMO{suffix}"

    # Keep the familiar demo capacity, but ensure every demo event is separate.
    sponsor_foc = 8
    blocked = 4
    class_rows = [
        {
            "class_id": f"CLSDEMO{suffix}VIP",
            "event_id": event_id,
            "class_name": "VIP",
            "price": 5000,
            "quantity": 20,
            "available": 20,
            "benefits": "Front rows and lounge access",
            "seating_mode": "ASSIGNED_SEAT",
        },
        {
            "class_id": f"CLSDEMO{suffix}PREM",
            "event_id": event_id,
            "class_name": "Premium",
            "price": 2500,
            "quantity": 24,
            "available": 24,
            "benefits": "Middle rows",
            "seating_mode": "ASSIGNED_SEAT",
        },
        {
            "class_id": f"CLSDEMO{suffix}GEN",
            "event_id": event_id,
            "class_name": "General",
            "price": 1000,
            "quantity": 28,
            "available": 28,
            "benefits": "General seating",
            "seating_mode": "ASSIGNED_SEAT",
        },
    ]
    sellable = sum(int(row["quantity"]) for row in class_rows)
    total = sellable + sponsor_foc + blocked

    new_event = {
        "event_id": event_id,
        "event_name": f"High5 Music Fest Demo {demo_number}",
        "event_type": "Concert",
        "artist_name": "High5 Collective",
        "production_company": "High5 Studios",
        "organizer_name": "Truflux Events",
        "venue": f"Bengaluru Arena Demo Hall {demo_number}",
        "address_line1": "Main Gate, Palace Grounds",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "pincode": "560001",
        "latitude": "12.9986",
        "longitude": "77.5921",
        "event_date": "2026-06-20",
        "event_time": "18:00",
        "event_dates": ["2026-06-20", "2026-06-21", "2026-06-22"],
        "event_times": ["18:00", "21:00"],
        "show_schedules": [
            {"show_id": "SCH001", "show_date": "2026-06-20", "show_time": "18:00", "doors_open_time": "16:30", "duration_minutes": 180, "status": "ACTIVE"},
            {"show_id": "SCH002", "show_date": "2026-06-21", "show_time": "18:00", "doors_open_time": "16:30", "duration_minutes": 180, "status": "ACTIVE"},
            {"show_id": "SCH003", "show_date": "2026-06-21", "show_time": "21:00", "doors_open_time": "19:30", "duration_minutes": 180, "status": "ACTIVE"},
            {"show_id": "SCH004", "show_date": "2026-06-22", "show_time": "18:00", "doors_open_time": "16:30", "duration_minutes": 180, "status": "ACTIVE"}
        ],
        "doors_open_time": "16:30",
        "duration_minutes": 180,
        "total_tickets": total,
        "number_of_classes": len(class_rows),
        "sponsor_foc_tickets": sponsor_foc,
        "blocked_tickets": blocked,
        "sellable_tickets": sellable,
        "sale_start_date": "2026-05-10",
        "sale_end_date": "2026-06-19",
        "age_restriction": "All ages",
        "description": "Demo event for biometric ticket booking",
        "terms": "Carry a backup ID. Biometric entry is subject to verification.",
        "status": "ACTIVE",
        "poster_image": "",
        "poster_name": "",
        "highlight_tags": ["TRENDING", "RECOMMENDED"],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }

    layout_request = SeatLayoutCreate(
        event_id=event_id,
        layout_type="gallery",
        class_capacity={row["class_name"]: row["quantity"] for row in class_rows},
        class_prices={row["class_name"]: row["price"] for row in class_rows},
    )
    new_seats = build_layout_from_request(layout_request)

    events.append(new_event)
    ticket_classes.extend(class_rows)
    seats.extend(new_seats)

    write_json("events.json", events)
    write_json("ticket_classes.json", ticket_classes)
    write_json("seats.json", seats)

    # Do not clear tickets, biometrics, wallets, or transactions. Multiple demo
    # events should be allowed without deleting existing bookings.
    return {
        "status": "SUCCESS",
        "message": f"Demo event {demo_number} created successfully",
        "event_id": event_id,
        "event_name": new_event["event_name"],
        "total_tickets": total,
        "sellable_tickets": sellable,
        "seats_created": len(new_seats),
    }


@app.post("/create-test-data")
def create_test_data():
    return seed_demo()


@app.get("/create-test-data")
def create_test_data_get():
    return seed_demo()


@app.get("/events/{event_id}/ticket-classes")
def list_ticket_classes(event_id: str):
    ticket_classes = read_json("ticket_classes.json")
    return [ticket_class for ticket_class in ticket_classes if ticket_class["event_id"] == event_id]


def build_demo_layout(event_id: str):
    request = SeatLayoutCreate(event_id=event_id, layout_type="gallery")
    return build_layout_from_request(request)


def _add_assigned_capacity(seats, event_id, section, price, row_start_index, capacity, seats_per_row, layout_type):
    capacity = int(capacity or 0)
    seats_per_row = max(int(seats_per_row or 10), 1)
    created = 0
    row_index = row_start_index

    while created < capacity:
        row_label = chr(65 + row_index) if row_index < 26 else f"R{row_index + 1}"
        seats_in_this_row = min(seats_per_row, capacity - created)
        for number in range(1, seats_in_this_row + 1):
            offset = abs((seats_in_this_row + 1) / 2 - number)
            curve_level = row_index - row_start_index + 1
            created += 1
            seats.append({
                "seat_id": f"{row_label}{number}",
                "event_id": event_id,
                "section": section,
                "row": row_label,
                "seat_number": number,
                "price": float(price or 0),
                "status": "AVAILABLE",
                "seating_mode": "ASSIGNED_SEAT",
                "layout_type": layout_type,
                "x_position": number,
                "y_position": curve_level + (offset * 0.12 if layout_type == "circular" else 0),
            })
        row_index += 1

    return row_index


def _add_capacity_tokens(seats, event_id, section, price, capacity, mode, layout_type):
    prefix = "FCFS" if mode == "FIRST_COME_FIRST_SERVE" else "NOSEAT"
    for number in range(1, int(capacity or 0) + 1):
        seats.append({
            "seat_id": f"{prefix}-{section.upper().replace(' ', '-')}-{number:03d}",
            "event_id": event_id,
            "section": section,
            "row": prefix,
            "seat_number": number,
            "price": float(price or 0),
            "status": "AVAILABLE",
            "seating_mode": mode,
            "layout_type": layout_type,
        })


def _event_ticket_classes(event_id: str):
    return [tc for tc in read_json("ticket_classes.json") if tc.get("event_id") == event_id]


def _event_sellable_capacity(event_id: str):
    event = next((item for item in read_json("events.json") if item.get("event_id") == event_id), None)
    if not event:
        return 0
    return int(event.get("sellable_tickets") or max(
        int(event.get("total_tickets") or 0) - int(event.get("sponsor_foc_tickets") or 0) - int(event.get("blocked_tickets") or 0),
        0
    ))


def _default_ticket_classes_for_event(event_record):
    sellable = int(event_record.get("sellable_tickets") or 0)
    number_of_classes = max(int(event_record.get("number_of_classes") or 1), 1)
    base_names = ["VIP", "Premium", "General", "Class 4", "Class 5", "Class 6"]
    base_prices = [5000, 2500, 1000, 750, 500, 250]
    rows = []
    remaining = sellable
    for idx in range(number_of_classes):
        slots_left = number_of_classes - idx
        qty = remaining // slots_left if slots_left else remaining
        remaining -= qty
        rows.append({
            "class_name": base_names[idx] if idx < len(base_names) else f"Class {idx + 1}",
            "price": base_prices[idx] if idx < len(base_prices) else 500,
            "quantity": qty,
            "benefits": "",
            "seating_mode": "ASSIGNED_SEAT",
        })
    return rows


def sync_event_ticket_classes(event_id: str, class_rows, event_record):
    all_classes = read_json("ticket_classes.json")
    all_classes = [item for item in all_classes if item.get("event_id") != event_id]

    source_rows = []
    if class_rows:
        source_rows = [row.model_dump() if hasattr(row, "model_dump") else row for row in class_rows]
    else:
        source_rows = _default_ticket_classes_for_event(event_record)

    for row in source_rows:
        quantity = int(row.get("quantity") or 0)
        all_classes.append({
            "class_id": "CLS" + uuid.uuid4().hex[:8].upper(),
            "event_id": event_id,
            "class_name": row.get("class_name") or "General",
            "price": float(row.get("price") or 0),
            "quantity": quantity,
            "available": quantity,
            "benefits": row.get("benefits") or "",
            "seating_mode": row.get("seating_mode") or "ASSIGNED_SEAT",
        })

    write_json("ticket_classes.json", all_classes)


def build_layout_from_request(request: SeatLayoutCreate):
    layout_type = (request.layout_type or "gallery").lower()
    no_seating = set(request.no_seating_classes or [])
    first_come = set(request.first_come_classes or [])
    seats = []

    existing_classes = _event_ticket_classes(request.event_id)
    if existing_classes and not request.class_capacity:
        class_capacity = {tc["class_name"]: int(tc.get("quantity") or 0) for tc in existing_classes}
        class_prices = {tc["class_name"]: float(tc.get("price") or 0) for tc in existing_classes}
        class_modes = {tc["class_name"]: tc.get("seating_mode") or "ASSIGNED_SEAT" for tc in existing_classes}
    else:
        class_capacity = request.class_capacity or {
            "VIP": int(request.vip_rows or 0) * int(request.vip_seats_per_row or 0),
            "Premium": int(request.premium_rows or 0) * int(request.premium_seats_per_row or 0),
            "General": int(request.general_rows or 0) * int(request.general_seats_per_row or 0),
        }
        class_prices = request.class_prices or {
            "VIP": request.vip_price,
            "Premium": request.premium_price,
            "General": request.general_price,
        }
        class_modes = {}

    seats_per_row_map = {
        "VIP": int(request.vip_seats_per_row or 10),
        "Premium": int(request.premium_seats_per_row or 12),
        "General": int(request.general_seats_per_row or 14),
    }

    next_row = 0
    for section, capacity in class_capacity.items():
        capacity = int(capacity or 0)
        if capacity <= 0:
            continue
        price = float(class_prices.get(section, 0) or 0)
        configured_mode = class_modes.get(section, "ASSIGNED_SEAT")

        if section in no_seating or layout_type == "no_seating" or configured_mode == "NO_SEATING":
            _add_capacity_tokens(seats, request.event_id, section, price, capacity, "NO_SEATING", layout_type)
        elif section in first_come or layout_type == "first_come" or configured_mode == "FIRST_COME_FIRST_SERVE":
            _add_capacity_tokens(seats, request.event_id, section, price, capacity, "FIRST_COME_FIRST_SERVE", layout_type)
        else:
            next_row = _add_assigned_capacity(
                seats, request.event_id, section, price, next_row, capacity, seats_per_row_map.get(section, 10), layout_type
            )

    return seats


def event_to_record(event: EventCreate, event_id: Optional[str] = None):
    payload = event.model_dump()
    payload.pop("ticket_classes", None)
    payload["event_id"] = event_id or "EVT" + uuid.uuid4().hex[:8].upper()
    payload["status"] = payload.get("status") or "ACTIVE"

    raw_schedules = payload.get("show_schedules") or []
    normalized_schedules = []
    for index, schedule in enumerate(raw_schedules):
        show_date = str(schedule.get("show_date") or "").strip()
        show_time = str(schedule.get("show_time") or "").strip()
        if not show_date or not show_time:
            continue
        normalized_schedules.append({
            "show_id": schedule.get("show_id") or f"SCH{index + 1:03d}",
            "show_date": show_date,
            "show_time": show_time,
            "doors_open_time": schedule.get("doors_open_time") or payload.get("doors_open_time") or "",
            "duration_minutes": int(schedule.get("duration_minutes") or payload.get("duration_minutes") or 0),
            "status": schedule.get("status") or "ACTIVE",
        })

    if not normalized_schedules and payload.get("event_date") and payload.get("event_time"):
        normalized_schedules.append({
            "show_id": "SCH001",
            "show_date": payload.get("event_date"),
            "show_time": payload.get("event_time"),
            "doors_open_time": payload.get("doors_open_time") or "",
            "duration_minutes": int(payload.get("duration_minutes") or 0),
            "status": "ACTIVE",
        })

    if normalized_schedules:
        first = normalized_schedules[0]
        payload["event_date"] = first["show_date"]
        payload["event_time"] = first["show_time"]
        payload["doors_open_time"] = first.get("doors_open_time", "")
        payload["duration_minutes"] = int(first.get("duration_minutes") or payload.get("duration_minutes") or 0)
        payload["event_dates"] = list(dict.fromkeys([item["show_date"] for item in normalized_schedules]))
        payload["event_times"] = list(dict.fromkeys([item["show_time"] for item in normalized_schedules]))
        payload["show_schedules"] = normalized_schedules
    else:
        payload["event_dates"] = []
        payload["event_times"] = []
        payload["show_schedules"] = []

    payload["sellable_tickets"] = max(
        int(payload.get("total_tickets") or 0)
        - int(payload.get("sponsor_foc_tickets") or 0)
        - int(payload.get("blocked_tickets") or 0),
        0,
    )
    payload["created_at"] = datetime.now().isoformat()
    payload["updated_at"] = datetime.now().isoformat()
    return payload


def validate_event_capacity(event_record, class_rows):
    sellable = int(event_record.get("sellable_tickets") or 0)
    rows = class_rows or []
    normalized = [row.model_dump() if hasattr(row, "model_dump") else row for row in rows]
    if not normalized:
        return None
    class_total = sum(int(row.get("quantity") or 0) for row in normalized)
    if class_total != sellable:
        return f"Ticket class quantity total must equal sellable tickets. Class total is {class_total}; sellable tickets is {sellable}."
    return None


@app.post("/events")
def create_event(event: EventCreate):
    events = read_json("events.json")
    new_event = event_to_record(event)
    capacity_error = validate_event_capacity(new_event, event.ticket_classes)
    if capacity_error:
        return {"status": "FAILED", "message": capacity_error}
    events.append(new_event)
    write_json("events.json", events)
    sync_event_ticket_classes(new_event["event_id"], event.ticket_classes, new_event)
    return {"status": "SUCCESS", "message": "Event created successfully", "event": new_event}


@app.get("/events")
def list_events():
    return read_json("events.json")


@app.get("/events/{event_id}")
def get_event(event_id: str):
    events = read_json("events.json")
    event = next((item for item in events if item["event_id"] == event_id), None)
    if not event:
        return {"status": "FAILED", "message": "Event not found"}
    return event


@app.put("/events/{event_id}")
def update_event(event_id: str, event: EventUpdate):
    events = read_json("events.json")
    existing = next((item for item in events if item["event_id"] == event_id), None)
    if not existing:
        return {"status": "FAILED", "message": "Event not found"}
    updated = event_to_record(event, event_id=event_id)
    capacity_error = validate_event_capacity(updated, event.ticket_classes)
    if capacity_error:
        return {"status": "FAILED", "message": capacity_error}
    updated["created_at"] = existing.get("created_at", datetime.now().isoformat())
    for index, item in enumerate(events):
        if item["event_id"] == event_id:
            events[index] = updated
            break
    write_json("events.json", events)
    sync_event_ticket_classes(event_id, event.ticket_classes, updated)
    return {"status": "SUCCESS", "message": "Event updated successfully", "event": updated}


@app.patch("/events/{event_id}")
def patch_event(event_id: str, event: EventUpdate):
    return update_event(event_id, event)


@app.post("/events/{event_id}/update")
def post_update_event(event_id: str, event: EventUpdate):
    return update_event(event_id, event)


@app.delete("/events/{event_id}")
def cancel_event(event_id: str):
    events = read_json("events.json")
    event = next((item for item in events if item["event_id"] == event_id), None)
    if not event:
        return {"status": "FAILED", "message": "Event not found"}
    event["status"] = "CANCELLED"
    event["updated_at"] = datetime.now().isoformat()
    write_json("events.json", events)
    return {"status": "SUCCESS", "message": "Event cancelled", "event": event}


@app.post("/events/{event_id}/ticket-classes")
def create_ticket_class(event_id: str, ticket_class: TicketClassCreate):
    ticket_classes = read_json("ticket_classes.json")
    new_class = {
        "class_id": "CLS" + uuid.uuid4().hex[:8].upper(),
        "event_id": event_id,
        "class_name": ticket_class.class_name,
        "price": ticket_class.price,
        "quantity": ticket_class.quantity,
        "available": ticket_class.quantity,
        "benefits": ticket_class.benefits,
    }
    ticket_classes.append(new_class)
    write_json("ticket_classes.json", ticket_classes)
    return {"status": "SUCCESS", "message": "Ticket class created successfully", "ticket_class": new_class}


@app.post("/seats/generate-layout")
def generate_seat_layout(request: SeatLayoutCreate):
    events = read_json("events.json")
    event = next((item for item in events if item.get("event_id") == request.event_id), None)
    if not event:
        return {"status": "FAILED", "message": "Please select a valid event before generating the seating layout.", "seats": []}

    ticket_classes = _event_ticket_classes(request.event_id)
    if not ticket_classes:
        return {
            "status": "FAILED",
            "message": "No ticket classes found for this event. Open Events, maintain the event, and add ticket classes first.",
            "seats": [],
        }

    expected_capacity = sum(int(item.get("quantity") or 0) for item in ticket_classes)
    sellable_capacity = _event_sellable_capacity(request.event_id)
    if expected_capacity != sellable_capacity:
        return {
            "status": "FAILED",
            "message": f"Ticket class total is {expected_capacity}, but event sellable tickets is {sellable_capacity}. Please fix the event ticket classes first.",
            "seats": [],
        }

    seats = read_json("seats.json")
    seats = [seat for seat in seats if seat.get("event_id") != request.event_id]
    new_layout = build_layout_from_request(request)
    seats.extend(new_layout)
    write_json("seats.json", seats)

    class_totals = {}
    for seat in new_layout:
        class_totals[seat["section"]] = class_totals.get(seat["section"], 0) + 1

    return {
        "status": "SUCCESS",
        "message": "Seating layout generated successfully from this event's actual ticket classes",
        "layout_type": request.layout_type,
        "total_units": len(new_layout),
        "sellable_tickets": sellable_capacity,
        "class_totals": class_totals,
        "seats": new_layout,
    }


@app.get("/events/{event_id}/seats")
def get_event_seats(event_id: str, event_date: Optional[str] = Query(default=None), event_time: Optional[str] = Query(default=None)):
    seats = [seat.copy() for seat in read_json("seats.json") if seat.get("event_id") == event_id]
    tickets = read_json("tickets.json")

    booked_seat_ids = set()
    for ticket in tickets:
        if ticket.get("event_id") != event_id:
            continue
        if ticket.get("ticket_status") == "CANCELLED":
            continue
        if event_date and ticket.get("event_date") != event_date:
            continue
        if event_time and ticket.get("event_time") != event_time:
            continue
        booked_seat_ids.add(ticket.get("seat_id"))

    for seat in seats:
        if seat.get("seat_id") in booked_seat_ids:
            seat["status"] = "BOOKED"
        elif seat.get("status") == "BOOKED" and event_date and event_time:
            # Older versions stored BOOKED on the master seat. For multi-show events,
            # availability must be calculated per show date/time.
            seat["status"] = "AVAILABLE"
    return seats


@app.post("/tickets/book-seat")
def book_selected_seat(booking: SeatBooking):
    tickets = read_json("tickets.json")
    biometrics = read_json("biometric_store.json")
    wallets = read_json("wallets.json")
    seats = read_json("seats.json")
    events = read_json("events.json")

    requested_seat_ids = booking.seat_ids or ([booking.seat_id] if booking.seat_id else [])
    requested_seat_ids = [seat_id for seat_id in requested_seat_ids if seat_id]

    if not requested_seat_ids:
        return {"status": "FAILED", "message": "Please select at least one seat."}

    if len(requested_seat_ids) > 6:
        return {
            "status": "FAILED",
            "message": "You can book a maximum of 6 tickets at once. For more than 6 tickets, please contact the office."
        }

    workflow_config = get_workflow_config()
    if workflow_config.get("biometric_enabled", True):
        try:
            face_signature, signature_engine, signature_hash = resolve_face_signature(booking.face_signature, booking.face_image_data)
        except ValueError as exc:
            return {"status": "FAILED", "message": str(exc)}
    else:
        face_signature = [0.0 for _ in range(128)]
        signature_engine = "BIOMETRIC_DISABLED_BY_WORKFLOW"
        signature_hash = hashlib.sha256(json.dumps(face_signature).encode("utf-8")).hexdigest()

    event = next((item for item in events if item.get("event_id") == booking.event_id), None)
    event_date = booking.event_date or (event or {}).get("event_date", "")
    event_time = booking.event_time or (event or {}).get("event_time", "")
    selected_seats = []

    existing_booked_for_show = {
        ticket.get("seat_id")
        for ticket in tickets
        if ticket.get("event_id") == booking.event_id
        and ticket.get("event_date") == event_date
        and ticket.get("event_time") == event_time
        and ticket.get("ticket_status") != "CANCELLED"
    }

    for seat_id in requested_seat_ids:
        selected_seat = next((seat for seat in seats if seat.get("event_id") == booking.event_id and seat.get("seat_id") == seat_id), None)
        if not selected_seat:
            return {"status": "FAILED", "message": f"Seat not found: {seat_id}"}
        if seat_id in existing_booked_for_show:
            return {"status": "FAILED", "message": f"Seat is already booked for {event_date} {event_time}: {seat_id}"}
        selected_seats.append(selected_seat)

    biometric_id = "BIO" + uuid.uuid4().hex[:8].upper()
    wallet_id = "WAL" + uuid.uuid4().hex[:8].upper()
    booking_group_id = "BKG" + uuid.uuid4().hex[:8].upper()
    ticket_ids = []
    ticket_records = []
    booking_time = datetime.now().isoformat()

    for selected_seat in selected_seats:
        ticket_id = "TKT" + uuid.uuid4().hex[:8].upper()
        ticket_ids.append(ticket_id)
        ticket_record = {
            "ticket_id": ticket_id,
            "booking_group_id": booking_group_id,
            "event_id": booking.event_id,
            "event_name": (event or {}).get("event_name", ""),
            "event_date": event_date,
            "event_time": event_time,
            "seat_id": selected_seat["seat_id"],
            "section": selected_seat.get("section", ""),
            "buyer_name": booking.buyer_name,
            "buyer_mobile": booking.buyer_mobile,
            "biometric_id": biometric_id,
            "ticket_status": "BOOKED",
            "entry_status": "NOT_CHECKED_IN",
            "amount_paid": float(selected_seat.get("price") or 0),
            "booking_time": booking_time,
        }
        ticket_records.append(ticket_record)
        selected_seat["last_ticket_id"] = ticket_id
        selected_seat["last_booking_group_id"] = booking_group_id
        selected_seat["last_booked_event_date"] = event_date
        selected_seat["last_booked_event_time"] = event_time

    qr_payload = make_1faceid_qr_payload(
        biometric_id=biometric_id,
        booking_group_id=booking_group_id,
        ticket_ids=ticket_ids,
        event={**(event or {}), "event_id": booking.event_id, "event_date": event_date, "event_time": event_time},
        buyer_name=booking.buyer_name,
        buyer_mobile=booking.buyer_mobile,
        face_signature=face_signature,
        signature_engine=signature_engine,
        signature_hash=signature_hash,
    )
    qr_data_url = make_qr_data_url(qr_payload)

    biometric_record = {
        "biometric_id": biometric_id,
        "user_name": booking.buyer_name,
        "face_signature": face_signature,
        "face_signature_hash": signature_hash,
        "signature_engine": signature_engine,
        "linked_ticket_ids": ticket_ids,
        "booking_group_id": booking_group_id,
        "wallet_id": wallet_id,
        "qr_payload": qr_payload,
        "qr_data_url": qr_data_url,
        "qr_format": "1BOOKING_FACEID_TICKET_QR_V1",
        "created_at": booking_time,
    }

    wallet_record = {"wallet_id": wallet_id, "biometric_id": biometric_id, "balance": 5000, "status": "ACTIVE"}

    biometrics.append(biometric_record)
    tickets.extend(ticket_records)
    wallets.append(wallet_record)

    write_json("biometric_store.json", biometrics)
    write_json("tickets.json", tickets)
    write_json("wallets.json", wallets)
    write_json("seats.json", seats)

    total_amount = sum(float(ticket.get("amount_paid") or 0) for ticket in ticket_records)

    issued_ticket = {
        "booking_group_id": booking_group_id,
        "event_id": booking.event_id,
        "event_name": (event or {}).get("event_name", ""),
        "venue": (event or {}).get("venue", ""),
        "city": (event or {}).get("city", ""),
        "event_date": event_date,
        "event_time": event_time,
        "buyer_name": booking.buyer_name,
        "buyer_mobile": booking.buyer_mobile,
        "biometric_id": biometric_id,
        "seat_numbers": [ticket["seat_id"] for ticket in ticket_records],
        "ticket_ids": ticket_ids,
        "ticket_count": len(ticket_records),
        "total_amount": total_amount,
        "qr_payload": qr_payload,
        "qr_data_url": qr_data_url,
        "qr_format": "1BOOKING_FACEID_TICKET_QR_V1",
        "tickets": ticket_records,
    }

    append_user_activity(
        "BOOKING_COMPLETED",
        username=booking.buyer_mobile,
        full_name=booking.buyer_name,
        role="AUDIENCE",
        page="SeatBookingPage",
        event_id=booking.event_id,
        event_name=(event or {}).get("event_name", ""),
        details={
            "booking_group_id": booking_group_id,
            "ticket_ids": ticket_ids,
            "event_date": event_date,
            "event_time": event_time,
            "seat_numbers": [ticket["seat_id"] for ticket in ticket_records],
            "ticket_count": len(ticket_records),
            "total_amount": total_amount,
        },
    )

    return {
        "status": "SUCCESS",
        "message": "Tickets booked successfully and biometric linked",
        "issued_ticket": issued_ticket,
        "tickets": ticket_records,
        "ticket": ticket_records[0] if ticket_records else None,
        "wallet": wallet_record,
    }


def calculate_distance(signature_a, signature_b):
    if not signature_a or not signature_b or len(signature_a) != len(signature_b):
        return 999
    return sum((float(a) - float(b)) ** 2 for a, b in zip(signature_a, signature_b)) ** 0.5


def match_threshold_for_engine(engine):
    if engine == "FACE_RECOGNITION_128D":
        return 0.60
    if engine == "OPENCV_FACE_TEMPLATE_128D":
        # OpenCV fallback is a normalized visual face-template, not a true dlib
        # embedding. It needs a wider threshold to resolve the same person across
        # small lighting/pose changes. The preferred 1Booking FaceID engine remains
        # face_recognition when installed.
        return 1.35
    if engine in ("CLIENT_SUPPLIED", "CLIENT_SUPPLIED_128D"):
        # Backward compatibility for biometric records created by older builds.
        return 1.35
    return 0.60


@app.post("/gate/verify-entry")
def verify_gate_entry(request: GateVerification):
    if not get_workflow_config().get("biometric_enabled", True):
        return {"status": "DENIED", "reason": "Biometric verification is disabled in workflow configuration. Use QR/manual validation for this workflow."}
    tickets = read_json("tickets.json")
    biometrics = read_json("biometric_store.json")
    try:
        live_signature, live_engine, _ = resolve_face_signature(request.live_face_signature, request.live_face_image_data)
    except ValueError as exc:
        return {"status": "DENIED", "reason": str(exc)}

    best_match = None
    best_distance = 999
    best_threshold = 0.55
    event_tickets = [ticket for ticket in tickets if ticket.get("event_id") == request.event_id and ticket.get("ticket_status", "BOOKED") == "BOOKED"]

    for ticket in event_tickets:
        biometric = next((bio for bio in biometrics if bio["biometric_id"] == ticket["biometric_id"]), None)
        if not biometric:
            continue
        distance = calculate_distance(biometric.get("face_signature"), live_signature)
        threshold = match_threshold_for_engine(biometric.get("signature_engine") or live_engine)
        if distance < best_distance:
            best_distance = distance
            best_match = ticket
            best_threshold = threshold

    if not best_match or best_distance > best_threshold:
        return {"status": "DENIED", "reason": "No matching biometric ticket found"}
    if best_match["entry_status"] == "CHECKED_IN":
        return {"status": "DENIED", "reason": "Ticket already used", "ticket_id": best_match["ticket_id"]}

    best_match["entry_status"] = "CHECKED_IN"
    best_match["checked_in_time"] = datetime.now().isoformat()
    write_json("tickets.json", tickets)

    return {"status": "ALLOWED", "message": "Entry verified successfully", "ticket": best_match, "match_score": best_distance}



@app.get("/admin/ticket-transactions")
def admin_ticket_transactions(
    event_id: Optional[str] = Query(default=None),
    event_date: Optional[str] = Query(default=None),
    event_time: Optional[str] = Query(default=None),
):
    events = read_json("events.json")
    tickets = read_json("tickets.json")
    seats = read_json("seats.json")

    # Tickets are the source of truth for sold inventory. Date/time filters are
    # intentionally optional because one event can now have multiple shows.
    filtered = list(tickets)
    if event_id:
        filtered = [ticket for ticket in filtered if ticket.get("event_id") == event_id]
    if event_date:
        filtered = [ticket for ticket in filtered if (ticket.get("event_date") or ticket.get("show_date") or "") == event_date]
    if event_time:
        filtered = [ticket for ticket in filtered if (ticket.get("event_time") or ticket.get("show_time") or "") == event_time]

    event_lookup = {event.get("event_id"): event for event in events}
    seat_lookup = {(seat.get("event_id"), seat.get("seat_id")): seat for seat in seats}

    transactions = []
    for ticket in filtered:
        event = event_lookup.get(ticket.get("event_id"), {})
        seat = seat_lookup.get((ticket.get("event_id"), ticket.get("seat_id")), {})
        transactions.append({
            "ticket_id": ticket.get("ticket_id", ""),
            "booking_group_id": ticket.get("booking_group_id") or ticket.get("booking_id") or ticket.get("ticket_id", ""),
            "event_id": ticket.get("event_id", ""),
            "event_name": ticket.get("event_name") or event.get("event_name", ""),
            "event_date": ticket.get("event_date") or ticket.get("show_date") or event.get("event_date", ""),
            "event_time": ticket.get("event_time") or ticket.get("show_time") or event.get("event_time", ""),
            "venue": event.get("venue", ""),
            "seat_id": ticket.get("seat_id", ""),
            "section": ticket.get("section") or seat.get("section", ""),
            "buyer_name": ticket.get("buyer_name", ""),
            "buyer_mobile": ticket.get("buyer_mobile", ""),
            "biometric_id": ticket.get("biometric_id", ""),
            "ticket_status": ticket.get("ticket_status") or ticket.get("status") or "BOOKED",
            "entry_status": ticket.get("entry_status", ""),
            "amount_paid": float(ticket.get("amount_paid") or 0),
            "booking_time": ticket.get("booking_time", ""),
            "reissue_count": int(ticket.get("reissue_count") or 0),
            "last_reissue_id": ticket.get("last_reissue_id", ""),
            "last_reissued_at": ticket.get("last_reissued_at", ""),
            "last_reissue_pdf_url": ticket.get("last_reissue_pdf_url", ""),
            "last_reissue_pdf_filename": ticket.get("last_reissue_pdf_filename", ""),
            "qr_format": ticket.get("qr_format", ""),
        })

    transactions.sort(key=lambda item: item.get("booking_time", ""), reverse=True)

    booking_group_summary = {}
    for item in transactions:
        group_id = item.get("booking_group_id") or item.get("ticket_id")
        if group_id not in booking_group_summary:
            booking_group_summary[group_id] = {
                "booking_group_id": group_id,
                "buyer_name": item.get("buyer_name", ""),
                "buyer_mobile": item.get("buyer_mobile", ""),
                "event_name": item.get("event_name", ""),
                "event_date": item.get("event_date", ""),
                "event_time": item.get("event_time", ""),
                "booking_time": item.get("booking_time", ""),
                "ticket_count": 0,
                "total_amount": 0,
                "seat_numbers": [],
            }
        booking_group_summary[group_id]["ticket_count"] += 1
        booking_group_summary[group_id]["total_amount"] += float(item.get("amount_paid") or 0)
        booking_group_summary[group_id]["seat_numbers"].append(item.get("seat_id", ""))

    return {
        "status": "SUCCESS",
        "count": len(transactions),
        "total_revenue": sum(float(item.get("amount_paid") or 0) for item in transactions),
        "booking_count": len(booking_group_summary),
        "bookings": list(booking_group_summary.values()),
        "tickets": transactions,
    }



@app.post("/admin/tickets/{ticket_id}/reissue")
def reissue_ticket(ticket_id: str):
    events = read_json("events.json")
    tickets = read_json("tickets.json")
    biometrics = read_json("biometric_store.json")

    ticket = next((item for item in tickets if item.get("ticket_id") == ticket_id), None)
    if not ticket:
        return {"status": "FAILED", "message": "Ticket not found"}

    biometric = next((item for item in biometrics if item.get("biometric_id") == ticket.get("biometric_id")), None)
    if not biometric:
        return {"status": "FAILED", "message": "Linked biometric record not found"}

    event = next((item for item in events if item.get("event_id") == ticket.get("event_id")), {})
    reissue_id = "REI" + uuid.uuid4().hex[:8].upper()
    reissued_at = datetime.now().isoformat()

    face_signature = biometric.get("face_signature") or []
    signature_engine = biometric.get("signature_engine") or "1Booking FaceID-128D"
    signature_hash = biometric.get("face_signature_hash") or hashlib.sha256(json.dumps(face_signature).encode("utf-8")).hexdigest()

    # Reissue is ticket-specific, but it keeps the same purchaser biometric identity.
    qr_payload = make_1faceid_qr_payload(
        biometric_id=ticket.get("biometric_id", ""),
        booking_group_id=ticket.get("booking_group_id") or ticket.get("ticket_id", ""),
        ticket_ids=[ticket.get("ticket_id", "")],
        event={
            **event,
            "event_id": ticket.get("event_id", ""),
            "event_name": ticket.get("event_name") or event.get("event_name", ""),
            "event_date": ticket.get("event_date") or ticket.get("show_date") or event.get("event_date", ""),
            "event_time": ticket.get("event_time") or ticket.get("show_time") or event.get("event_time", ""),
        },
        buyer_name=ticket.get("buyer_name", ""),
        buyer_mobile=ticket.get("buyer_mobile", ""),
        face_signature=face_signature,
        signature_engine=signature_engine,
        signature_hash=signature_hash,
    )
    qr_data_url = make_qr_data_url(qr_payload)

    ticket["reissue_count"] = int(ticket.get("reissue_count") or 0) + 1
    ticket["last_reissue_id"] = reissue_id
    ticket["last_reissued_at"] = reissued_at
    ticket["qr_payload"] = qr_payload
    ticket["qr_data_url"] = qr_data_url
    ticket["qr_format"] = "1BOOKING_FACEID_TICKET_QR_V1"

    reissue_log = ticket.get("reissue_log") or []
    reissue_log.append({
        "reissue_id": reissue_id,
        "reissued_at": reissued_at,
        "qr_format": "1BOOKING_FACEID_TICKET_QR_V1",
    })
    ticket["reissue_log"] = reissue_log

    # Keep the biometric record aware of the latest QR generated for audit/reverse lookup.
    biometric["last_reissue_id"] = reissue_id
    biometric["last_reissued_at"] = reissued_at
    biometric["last_reissued_ticket_id"] = ticket.get("ticket_id", "")

    write_json("tickets.json", tickets)
    write_json("biometric_store.json", biometrics)

    issued_ticket = {
        "reissue_id": reissue_id,
        "reissued_at": reissued_at,
        "booking_group_id": ticket.get("booking_group_id") or ticket.get("ticket_id", ""),
        "ticket_id": ticket.get("ticket_id", ""),
        "event_id": ticket.get("event_id", ""),
        "event_name": ticket.get("event_name") or event.get("event_name", ""),
        "venue": event.get("venue", ""),
        "city": event.get("city", ""),
        "event_date": ticket.get("event_date") or event.get("event_date", ""),
        "event_time": ticket.get("event_time") or event.get("event_time", ""),
        "buyer_name": ticket.get("buyer_name", ""),
        "buyer_mobile": ticket.get("buyer_mobile", ""),
        "biometric_id": ticket.get("biometric_id", ""),
        "seat_numbers": [ticket.get("seat_id", "")],
        "ticket_ids": [ticket.get("ticket_id", "")],
        "ticket_count": 1,
        "total_amount": float(ticket.get("amount_paid") or 0),
        "qr_payload": qr_payload,
        "qr_data_url": qr_data_url,
        "qr_format": "1BOOKING_FACEID_TICKET_QR_V1",
        "reissue_count": ticket.get("reissue_count", 1),
    }

    try:
        pdf_info = create_ticket_pdf_file(issued_ticket)
        issued_ticket.update(pdf_info)
        ticket["last_reissue_pdf_url"] = pdf_info["pdf_download_url"]
        ticket["last_reissue_pdf_filename"] = pdf_info["pdf_filename"]
        reissue_log[-1]["pdf_filename"] = pdf_info["pdf_filename"]
        reissue_log[-1]["pdf_download_url"] = pdf_info["pdf_download_url"]
        ticket["reissue_log"] = reissue_log
        write_json("tickets.json", tickets)
    except Exception as exc:
        return {
            "status": "FAILED",
            "message": f"Ticket QR was regenerated, but PDF creation failed: {exc}",
        }

    return {
        "status": "SUCCESS",
        "message": "Ticket reissued successfully and PDF file created",
        "issued_ticket": issued_ticket,
        "ticket": ticket,
    }



def _parse_event_date(value: str):
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except Exception:
            continue
    return None


def _ticket_bucket(ticket: dict):
    status = ticket.get("ticket_status", "BOOKED")
    entry_status = ticket.get("entry_status", "NOT_CHECKED_IN")
    event_date = _parse_event_date(ticket.get("event_date", ""))
    today = datetime.now().date()

    if status == "CANCELLED" or entry_status == "CHECKED_IN" or (event_date and event_date < today):
        return "PAST"
    return "ACTIVE"


@app.get("/audience/bookings")
def audience_bookings(
    mobile: str = Query(default=""),
    username: str = Query(default=""),
    view: str = Query(default="ALL"),
):
    """Return active and past bookings for the logged-in audience user.

    The local demo app uses mobile as the audience username, so mobile/username
    are both accepted. This keeps the page useful even when older tickets only
    have buyer_mobile saved.
    """
    events = read_json("events.json")
    tickets = read_json("tickets.json")
    biometrics = read_json("biometric_store.json")
    event_lookup = {event.get("event_id"): event for event in events}
    biometric_lookup = {bio.get("biometric_id"): bio for bio in biometrics}

    lookup_values = {str(mobile or "").strip(), str(username or "").strip()}
    lookup_values.discard("")

    if not lookup_values:
        return {"status": "FAILED", "message": "Mobile number or username is required", "active": [], "past": [], "bookings": []}

    rows = []
    for ticket in tickets:
        if str(ticket.get("buyer_mobile", "")).strip() not in lookup_values:
            continue
        event = event_lookup.get(ticket.get("event_id"), {})
        biometric = biometric_lookup.get(ticket.get("biometric_id"), {})
        row = {
            "ticket_id": ticket.get("ticket_id", ""),
            "booking_group_id": ticket.get("booking_group_id") or ticket.get("booking_id") or ticket.get("ticket_id", ""),
            "event_id": ticket.get("event_id", ""),
            "event_name": ticket.get("event_name") or event.get("event_name", ""),
            "event_type": event.get("event_type", ""),
            "poster_image": event.get("poster_image", ""),
            "highlight_tags": event.get("highlight_tags", []),
            "venue": event.get("venue", ""),
            "city": event.get("city", ""),
            "state": event.get("state", ""),
            "country": event.get("country", ""),
            "event_date": ticket.get("event_date") or ticket.get("show_date") or event.get("event_date", ""),
            "event_time": ticket.get("event_time") or ticket.get("show_time") or event.get("event_time", ""),
            "seat_id": ticket.get("seat_id", ""),
            "section": ticket.get("section", ""),
            "buyer_name": ticket.get("buyer_name", ""),
            "buyer_mobile": ticket.get("buyer_mobile", ""),
            "biometric_id": ticket.get("biometric_id", ""),
            "ticket_status": ticket.get("ticket_status", "BOOKED"),
            "entry_status": ticket.get("entry_status", "NOT_CHECKED_IN"),
            "amount_paid": float(ticket.get("amount_paid") or 0),
            "booking_time": ticket.get("booking_time", ""),
            "cancelled_at": ticket.get("cancelled_at", ""),
            "cancellation_reason": ticket.get("cancellation_reason", ""),
            "qr_data_url": ticket.get("qr_data_url") or biometric.get("qr_data_url", ""),
            "qr_format": ticket.get("qr_format") or biometric.get("qr_format", "1BOOKING_FACEID_TICKET_QR_V1"),
        }
        row["bucket"] = _ticket_bucket(row)
        rows.append(row)

    rows.sort(key=lambda item: item.get("booking_time", ""), reverse=True)
    active = [row for row in rows if row["bucket"] == "ACTIVE"]
    past = [row for row in rows if row["bucket"] == "PAST"]

    requested_view = view.upper()
    if requested_view == "ACTIVE":
        visible = active
    elif requested_view == "PAST":
        visible = past
    else:
        visible = rows

    return {
        "status": "SUCCESS",
        "count": len(visible),
        "active_count": len(active),
        "past_count": len(past),
        "active": active,
        "past": past,
        "bookings": visible,
    }


@app.post("/audience/tickets/{ticket_id}/cancel")
def cancel_audience_ticket(ticket_id: str, mobile: str = Query(default=""), reason: str = Query(default="Audience cancellation")):
    tickets = read_json("tickets.json")
    seats = read_json("seats.json")
    biometrics = read_json("biometric_store.json")

    ticket = next((item for item in tickets if item.get("ticket_id") == ticket_id), None)
    if not ticket:
        return {"status": "FAILED", "message": "Ticket not found"}

    if mobile and str(ticket.get("buyer_mobile", "")).strip() != str(mobile).strip():
        return {"status": "FAILED", "message": "This ticket does not belong to the logged-in audience user"}

    if ticket.get("ticket_status") == "CANCELLED":
        return {"status": "FAILED", "message": "Ticket is already cancelled"}

    if ticket.get("entry_status") == "CHECKED_IN":
        return {"status": "FAILED", "message": "Checked-in tickets cannot be cancelled"}

    now = datetime.now().isoformat()
    ticket["ticket_status"] = "CANCELLED"
    ticket["entry_status"] = "CANCELLED"
    ticket["cancelled_at"] = now
    ticket["cancellation_reason"] = reason or "Audience cancellation"

    for seat in seats:
        if seat.get("event_id") == ticket.get("event_id") and seat.get("seat_id") == ticket.get("seat_id"):
            seat["status"] = "AVAILABLE"
            seat.pop("ticket_id", None)
            seat.pop("booking_group_id", None)
            break

    for biometric in biometrics:
        if biometric.get("biometric_id") == ticket.get("biometric_id"):
            linked = biometric.get("linked_ticket_ids") or []
            biometric["linked_ticket_ids"] = [item for item in linked if item != ticket_id]
            biometric["last_cancelled_ticket_id"] = ticket_id
            biometric["last_cancelled_at"] = now
            break

    write_json("tickets.json", tickets)
    write_json("seats.json", seats)
    write_json("biometric_store.json", biometrics)

    return {
        "status": "SUCCESS",
        "message": "Ticket cancelled successfully",
        "ticket": ticket,
    }

@app.post("/wallet/topup")
def wallet_topup(request: WalletTopup):
    wallets = read_json("wallets.json")
    wallet = next((wallet for wallet in wallets if wallet["biometric_id"] == request.biometric_id), None)
    if not wallet:
        return {"status": "FAILED", "message": "Wallet not found"}
    wallet["balance"] += request.amount
    write_json("wallets.json", wallets)
    return {"status": "SUCCESS", "message": "Wallet topped up", "wallet": wallet}


@app.post("/wallet/face-pay")
def face_pay(request: FacePurchase):
    biometrics = read_json("biometric_store.json")
    wallets = read_json("wallets.json")
    transactions = read_json("transactions.json")
    try:
        live_signature, live_engine, _ = resolve_face_signature(request.live_face_signature, request.live_face_image_data)
    except ValueError as exc:
        return {"status": "FAILED", "message": str(exc)}

    best_biometric = None
    best_distance = 999
    best_threshold = 0.55

    for biometric in biometrics:
        distance = calculate_distance(biometric.get("face_signature"), live_signature)
        threshold = match_threshold_for_engine(biometric.get("signature_engine") or live_engine)
        if distance < best_distance:
            best_distance = distance
            best_biometric = biometric
            best_threshold = threshold

    if not best_biometric or best_distance > best_threshold:
        return {"status": "FAILED", "message": "Biometric verification failed"}

    wallet = next((wallet for wallet in wallets if wallet["wallet_id"] == best_biometric["wallet_id"]), None)
    if not wallet:
        return {"status": "FAILED", "message": "Wallet not found"}
    if wallet["balance"] < request.amount:
        return {"status": "FAILED", "message": "Insufficient wallet balance"}

    wallet["balance"] -= request.amount
    transaction = {
        "transaction_id": "TXN" + uuid.uuid4().hex[:8].upper(),
        "wallet_id": wallet["wallet_id"],
        "biometric_id": best_biometric["biometric_id"],
        "amount": request.amount,
        "description": request.description,
        "transaction_type": "FACE_PAY",
        "status": "SUCCESS",
        "timestamp": datetime.now().isoformat(),
    }
    transactions.append(transaction)
    write_json("wallets.json", wallets)
    write_json("transactions.json", transactions)
    return {"status": "SUCCESS", "message": "Payment successful using biometric", "transaction": transaction, "remaining_balance": wallet["balance"]}


@app.get("/tickets")
def list_tickets():
    return read_json("tickets.json")


# -----------------------------------------------------------------------------
# Railway / single-service deployment: serve the built React frontend from
# backend/static. Dockerfile copies frontend/dist into this directory.
# Keep this at the end so API routes above keep priority.
# -----------------------------------------------------------------------------
FRONTEND_DIST_DIR = os.environ.get(
    "ONEBOOKING_FRONTEND_DIST",
    os.path.join(BASE_DIR, "static"),
)

if os.path.isdir(FRONTEND_DIST_DIR):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend_assets")

    @app.get("/{full_path:path}")
    def serve_react_app(full_path: str):
        requested_file = os.path.join(FRONTEND_DIST_DIR, full_path)
        if full_path and os.path.isfile(requested_file):
            return FileResponse(requested_file)
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))
