import cv2
import time
import threading
from ultralytics import YOLO
from playsound3 import playsound


# ==========================================
# LOAD YOLO MODEL
# ==========================================

model = YOLO("yolo11n.pt")


# ==========================================
# CAMERA
# ==========================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera could not be opened")
    exit()


# ==========================================
# SETTINGS
# ==========================================

CONFIDENCE = 0.55

MIN_PERSON_WIDTH = 100
MIN_PERSON_HEIGHT = 150

HORIZONTAL_RATIO = 1.25

FALL_CONFIRM_TIME = 2.0

FALL_HOLD_TIME = 8.0


# ==========================================
# VARIABLES
# ==========================================

previous_center = None

movement_recent = False
movement_time = None

possible_fall_start = None

fall_confirmed = False
fall_confirmed_time = None

alert_sent = False


# ==========================================
# EMERGENCY ALERT FUNCTION
# ==========================================

def emergency_alert(frame):

    print()
    print("===================================")
    print("🚨 FALL CONFIRMED!")
    print("🚨 EMERGENCY ALERT ACTIVATED")
    print("===================================")

    # --------------------------------------
    # Save evidence image
    # --------------------------------------

    filename = "fall_detected.jpg"

    cv2.imwrite(
        filename,
        frame
    )

    print(f"📸 Image saved: {filename}")

    # --------------------------------------
    # Play alarm
    # --------------------------------------

    try:

        playsound("alarm.mp3")

        print("🔊 Alarm finished")

    except Exception as e:

        print("❌ Alarm error:", e)


# ==========================================
# START MESSAGE
# ==========================================

print("===================================")
print("       SMART FALL DETECTION")
print("===================================")
print("Camera started")
print("Press Q to quit")


# ==========================================
# MAIN LOOP
# ==========================================

while True:

    ret, frame = cap.read()

    if not ret:

        print("❌ Camera frame error")

        break


    frame = cv2.resize(
        frame,
        (960, 720)
    )


    # ======================================
    # YOLO DETECTION
    # ======================================

    results = model(
        frame,
        conf=CONFIDENCE,
        classes=[0],
        verbose=False
    )


    best_box = None
    best_confidence = 0


    # ======================================
    # FIND PERSON
    # ======================================

    for result in results:

        for box in result.boxes:

            confidence = float(
                box.conf[0]
            )

            if confidence < CONFIDENCE:

                continue


            x1, y1, x2, y2 = map(
                int,
                box.xyxy[0]
            )


            width = x2 - x1
            height = y2 - y1


            # Reject small objects

            if width < MIN_PERSON_WIDTH:

                continue

            if height < MIN_PERSON_HEIGHT:

                continue


            # Keep strongest person

            if confidence > best_confidence:

                best_confidence = confidence

                best_box = (
                    x1,
                    y1,
                    x2,
                    y2,
                    width,
                    height
                )


    person_detected = False

    horizontal_person = False

    current_movement = False


    # ======================================
    # PROCESS PERSON
    # ======================================

    if best_box is not None:

        person_detected = True


        x1, y1, x2, y2, width, height = best_box


        # Person center

        center_x = (
            x1 + x2
        ) // 2

        center_y = (
            y1 + y2
        ) // 2


        # ==================================
        # MOVEMENT DETECTION
        # ==================================

        if previous_center is not None:

            dx = abs(
                center_x -
                previous_center[0]
            )

            dy = abs(
                center_y -
                previous_center[1]
            )

            movement = dx + dy


            if movement > 4:

                current_movement = True

                movement_recent = True

                movement_time = time.time()


        previous_center = (
            center_x,
            center_y
        )


        # ==================================
        # BODY RATIO
        # ==================================

        aspect_ratio = (
            width /
            float(height)
        )


        if aspect_ratio > HORIZONTAL_RATIO:

            horizontal_person = True


        # ==================================
        # DRAW PERSON BOX
        # ==================================

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            3
        )


        cv2.putText(
            frame,
            f"PERSON {best_confidence:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )


        cv2.putText(
            frame,
            f"W:{width} H:{height}",
            (x1, y2 + 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2
        )


        if horizontal_person:

            cv2.putText(
                frame,
                "HORIZONTAL",
                (x1, y2 + 55),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 255),
                2
            )

        else:

            cv2.putText(
                frame,
                "UPRIGHT",
                (x1, y2 + 55),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2
            )


    else:

        previous_center = None


    # ======================================
    # REMEMBER MOVEMENT
    # ======================================

    if movement_recent:

        if (
            time.time()
            - movement_time
            > 1.5
        ):

            movement_recent = False


    # ======================================
    # START FALL DETECTION
    # ======================================

    if (
        person_detected
        and horizontal_person
        and movement_recent
        and not fall_confirmed
    ):

        if possible_fall_start is None:

            possible_fall_start = (
                time.time()
            )

            print(
                "⚠️ Possible fall detected"
            )


    # ======================================
    # FALL CONFIRMATION
    # ======================================

    if possible_fall_start is not None:

        elapsed = (
            time.time()
            - possible_fall_start
        )


        remaining = max(
            0,
            FALL_CONFIRM_TIME -
            elapsed
        )


        cv2.putText(
            frame,
            f"CHECKING FALL: {remaining:.1f}s",
            (20, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 165, 255),
            2
        )


        # Person still horizontal

        if (
            person_detected
            and horizontal_person
        ):

            if (
                elapsed >=
                FALL_CONFIRM_TIME
            ):

                fall_confirmed = True

                fall_confirmed_time = (
                    time.time()
                )

                possible_fall_start = None

                print(
                    "🚨 FALL CONFIRMED!"
                )


                # ==================================
                # SEND ALERT ONLY ONCE
                # ==================================

                if not alert_sent:

                    alert_sent = True


                    threading.Thread(
                        target=emergency_alert,
                        args=(frame.copy(),),
                        daemon=True
                    ).start()


        else:

            possible_fall_start = None


    # ======================================
    # FALL CONFIRMED DISPLAY
    # ======================================

    if fall_confirmed:

        # Red border

        cv2.rectangle(
            frame,
            (0, 0),
            (959, 719),
            (0, 0, 255),
            10
        )


        cv2.putText(
            frame,
            "!!! FALL CONFIRMED !!!",
            (180, 110),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.4,
            (0, 0, 255),
            4
        )


        cv2.putText(
            frame,
            "EMERGENCY ALERT ACTIVATED",
            (200, 160),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 255),
            3
        )


        # Keep alert visible

        if (
            time.time()
            - fall_confirmed_time
            > FALL_HOLD_TIME
        ):

            fall_confirmed = False

            possible_fall_start = None

            movement_recent = False

            alert_sent = False


    # ======================================
    # STATUS
    # ======================================

    if not person_detected:

        cv2.putText(
            frame,
            "NO PERSON",
            (20, 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 0, 255),
            2
        )

    elif not fall_confirmed:

        cv2.putText(
            frame,
            "LIVE PERSON DETECTED",
            (20, 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2
        )


    # ======================================
    # SHOW CAMERA
    # ======================================

    cv2.imshow(
        "SMART FALL DETECTION",
        frame
    )


    # ======================================
    # QUIT
    # ======================================

    if cv2.waitKey(1) & 0xFF == ord("q"):

        break


# ==========================================
# CLEANUP
# ==========================================

cap.release()

cv2.destroyAllWindows()