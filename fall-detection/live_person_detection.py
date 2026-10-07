import cv2
from ultralytics import YOLO

# Load YOLO model
model = YOLO("yolo11n.pt")

# Start webcam
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera could not be opened")
    exit()

print("✅ Live person detection started")
print("Press Q to quit")

while True:

    ret, frame = cap.read()

    if not ret:
        print("❌ Could not read camera")
        break

    # Run YOLO detection
    results = model(
        frame,
        conf=0.5,
        verbose=False
    )

    person_detected = False

    for result in results:

        boxes = result.boxes

        for box in boxes:

            # Class ID
            class_id = int(box.cls[0])

            # COCO class 0 = person
            if class_id != 0:
                continue

            person_detected = True

            # Bounding box
            x1, y1, x2, y2 = map(
                int,
                box.xyxy[0]
            )

            # Confidence
            confidence = float(box.conf[0])

            # Width and height
            width = x2 - x1
            height = y2 - y1

            # Aspect ratio
            aspect_ratio = width / float(height)

            # Draw box
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2
            )

            # Person label
            cv2.putText(
                frame,
                f"Person {confidence:.2f}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2
            )

            # Display dimensions
            cv2.putText(
                frame,
                f"W:{width} H:{height}",
                (x1, y2 + 20),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1
            )

            # Check horizontal position
            if aspect_ratio > 1.5:

                cv2.putText(
                    frame,
                    "POSSIBLE FALL",
                    (x1, y2 + 45),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 0, 255),
                    2
                )

            else:

                cv2.putText(
                    frame,
                    "UPRIGHT",
                    (x1, y2 + 45),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 0),
                    2
                )

    # Overall status
    if person_detected:

        cv2.putText(
            frame,
            "PERSON DETECTED",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0),
            2
        )

    else:

        cv2.putText(
            frame,
            "NO PERSON",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 0, 255),
            2
        )

    # Show live video
    cv2.imshow(
        "Live Person Detection",
        frame
    )

    # Q to quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()