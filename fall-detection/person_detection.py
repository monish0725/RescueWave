import cv2

# Start camera
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera could not be opened")
    exit()

# HOG Person Detector
hog = cv2.HOGDescriptor()

hog.setSVMDetector(
    cv2.HOGDescriptor_getDefaultPeopleDetector()
)

print("✅ Person detection started")
print("Press Q to quit")

while True:

    ret, frame = cap.read()

    if not ret:
        print("❌ Could not read camera")
        break

    # Resize frame for faster processing
    frame = cv2.resize(frame, (800, 600))

    # Detect people
    boxes, weights = hog.detectMultiScale(
        frame,
        winStride=(8, 8),
        padding=(8, 8),
        scale=1.05
    )

    person_detected = False

    for i, (x, y, w, h) in enumerate(boxes):

        # Detection confidence
        confidence = weights[i]

        # Only accept reasonably strong detections
        if confidence < 0.5:
            continue

        person_detected = True

        # Draw bounding box
        cv2.rectangle(
            frame,
            (x, y),
            (x + w, y + h),
            (0, 255, 0),
            2
        )

        # Calculate body ratio
        aspect_ratio = w / float(h)

        # Display confidence
        cv2.putText(
            frame,
            f"Person: {confidence:.2f}",
            (x, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

        # Display dimensions
        cv2.putText(
            frame,
            f"W:{w} H:{h}",
            (x, y + h + 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1
        )

        # Check body orientation
        if aspect_ratio > 1.5:

            cv2.putText(
                frame,
                "POSSIBLE FALL",
                (x, y + h + 45),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 255),
                2
            )

        else:

            cv2.putText(
                frame,
                "UPRIGHT",
                (x, y + h + 45),
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

    # Show camera
    cv2.imshow(
        "Person Detection - Fall Detection",
        frame
    )

    # Quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()