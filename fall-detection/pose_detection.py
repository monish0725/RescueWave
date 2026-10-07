import cv2

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera could not be opened")
    exit()

print("✅ Fall detection started")
print("Press Q to quit")

while True:

    ret, frame = cap.read()

    if not ret:
        print("❌ Could not read camera")
        break

    # Convert to grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Blur the image
    gray = cv2.GaussianBlur(gray, (21, 21), 0)

    # Detect movement
    if 'previous_frame' not in globals():
        previous_frame = gray
        continue

    difference = cv2.absdiff(previous_frame, gray)

    # Threshold
    _, threshold = cv2.threshold(
        difference,
        25,
        255,
        cv2.THRESH_BINARY
    )

    # Remove small noise
    threshold = cv2.dilate(
        threshold,
        None,
        iterations=2
    )

    # Find contours
    contours, _ = cv2.findContours(
        threshold,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    movement_detected = False

    for contour in contours:

        area = cv2.contourArea(contour)

        if area < 1500:
            continue

        x, y, w, h = cv2.boundingRect(contour)

        movement_detected = True

        cv2.rectangle(
            frame,
            (x, y),
            (x + w, y + h),
            (0, 255, 0),
            2
        )

        # Calculate aspect ratio
        aspect_ratio = w / float(h)

        # Simple fall indication
        if aspect_ratio > 1.5:

            cv2.putText(
                frame,
                "POSSIBLE FALL",
                (20, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.2,
                (0, 0, 255),
                3
            )

        else:

            cv2.putText(
                frame,
                "NORMAL MOVEMENT",
                (20, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (0, 255, 0),
                2
            )

    if not movement_detected:

        cv2.putText(
            frame,
            "NO MOVEMENT",
            (20, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (255, 255, 255),
            2
        )

    cv2.imshow(
        "OpenCV Fall Detection",
        frame
    )

    previous_frame = gray

    if cv2.waitKey(30) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()