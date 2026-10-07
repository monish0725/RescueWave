"""Facial emotion classification — optional, and deliberately NOT something
this service trains itself. Training the original script's model needs the
FER2013 dataset (35k labeled face images), which isn't shipped here and
takes real time/compute to train properly — doing that inline in a
"detection service" would be its own separate project. If you have an
already-trained Keras model (.h5) — from running the original script's
training path yourself, or another FER2013-trained model — point
EMOTION_MODEL_PATH at it and this module will use it. Otherwise it reports
itself unavailable and the SOS module just skips the emotion gate.
"""
import logging
import json
import os

import cv2
import numpy as np

from ..config import config

log = logging.getLogger("rescuewave_ai.sos.emotion")

EMOTION_LABELS = {0: "Angry", 1: "Disgust", 2: "Fear", 3: "Happy", 4: "Sad", 5: "Surprise", 6: "Neutral"}
EMERGENCY_EMOTIONS = {"Angry", "Fear", "Sad", "Disgust", "Surprise"}
IMG_SIZE = 48

_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_smile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_smile.xml")

try:
    from tensorflow.keras.models import load_model

    _TF_AVAILABLE = True
except Exception:
    _TF_AVAILABLE = False


class EmotionDetector:
    def __init__(self, model_path: str, alert_threshold: float = None):
        self.model_path = model_path
        self.alert_threshold = config.EMOTION_ALERT_THRESHOLD if alert_threshold is None else alert_threshold
        self._model = None
        self._labels = EMOTION_LABELS
        self._input_shape = None
        self.last_label = None
        self.last_confidence = 0.0
        self.last_smile_confidence = 0.0
        self._history = []

        if not model_path:
            log.info("Emotion detection disabled (EMOTION_MODEL_PATH not set).")
            return
        if not _TF_AVAILABLE:
            log.info("Emotion detection disabled (tensorflow not installed — see requirements-optional.txt).")
            return
        try:
            self._model = load_model(model_path)
            self._input_shape = self._model.input_shape
            self._labels = self._load_labels(model_path, self._model.output_shape[-1])
            log.info("Loaded emotion model from %s", model_path)
        except Exception as e:
            log.warning("Could not load emotion model at %s: %s", model_path, e)

    @property
    def available(self) -> bool:
        return self._model is not None

    def _load_labels(self, model_path: str, output_count: int):
        labels_path = os.path.join(os.path.dirname(model_path), "emotion_labels.json")
        if not os.path.isfile(labels_path):
            if output_count != len(EMOTION_LABELS):
                log.warning(
                    "Emotion model has %s output classes but no emotion_labels.json was found next to it; falling back to numeric labels.",
                    output_count,
                )
                return {i: str(i) for i in range(output_count)}
            return EMOTION_LABELS
        try:
            with open(labels_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            labels = {int(k): self._normalize_label(v) for k, v in raw.items()}
            log.info("Loaded emotion labels from %s: %s", labels_path, labels)
            return labels
        except Exception as e:
            log.warning("Could not load emotion labels at %s: %s", labels_path, e)
            return EMOTION_LABELS

    def update(self, bgr_frame) -> None:
        """Runs one prediction and caches the result on self.last_label /
        self.last_confidence — call this periodically (e.g. every ~10
        frames), not every frame, since it's the most expensive step."""
        if not self.available:
            return
        gray = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2GRAY)
        faces = _face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(48, 48))
        if len(faces) == 0:
            return
        x, y, w, h = sorted(faces, key=lambda r: r[2] * r[3], reverse=True)[0]
        pad = int(0.12 * max(w, h))
        x1, y1 = max(0, x - pad), max(0, y - pad)
        x2, y2 = min(gray.shape[1], x + w + pad), min(gray.shape[0], y + h + pad)
        face_roi = gray[y1:y2, x1:x2]
        try:
            face_gray = cv2.resize(face_roi, (IMG_SIZE, IMG_SIZE))
        except Exception:
            return
        face_gray = cv2.equalizeHist(face_gray)
        face_norm = self._prepare_input(face_gray)
        try:
            probs = self._model.predict(face_norm, verbose=0)[0]
        except Exception as e:
            log.warning("Emotion prediction failed: %s", e)
            return
        idx = int(np.argmax(probs))
        label = self._normalize_label(self._labels.get(idx, str(idx)))
        confidence = float(probs[idx])
        smile_confidence = self._smile_confidence(face_roi)
        self.last_smile_confidence = smile_confidence
        if smile_confidence >= 0.42:
            label = "Happy"
            confidence = smile_confidence
            self._history = []
        self._history.append((label, confidence))
        self._history = self._history[-5:]
        weighted = {}
        for hist_label, hist_conf in self._history:
            weighted[hist_label] = weighted.get(hist_label, 0.0) + hist_conf
        self.last_label = max(weighted, key=weighted.get)
        matching = [conf for hist_label, conf in self._history if hist_label == self.last_label]
        self.last_confidence = float(sum(matching) / max(1, len(matching)))

    def indicates_distress(self) -> bool:
        """Used as a gate before raising a gesture/voice alert — mirrors the
        original script's behavior of only alerting when the detected
        emotion also looks like distress, to cut down on false positives
        from an idle wave or normal conversation."""
        if not self.available:
            return True  # no model configured — don't block alerts on a check we can't perform
        return self._normalize_label(self.last_label) in EMERGENCY_EMOTIONS and self.last_confidence >= self.alert_threshold

    def _prepare_input(self, face_gray):
        channels = 1
        if self._input_shape and len(self._input_shape) >= 4 and self._input_shape[-1] in (1, 3):
            channels = self._input_shape[-1]
        if channels == 3:
            face = cv2.cvtColor(face_gray, cv2.COLOR_GRAY2RGB).astype("float32") / 255.0
        else:
            face = np.expand_dims(face_gray.astype("float32") / 255.0, axis=-1)
        return np.expand_dims(face, axis=0)

    @staticmethod
    def _normalize_label(label):
        if label is None:
            return None
        value = str(label).strip().lower()
        aliases = {
            "happiness": "Happy",
            "happy": "Happy",
            "angry": "Angry",
            "anger": "Angry",
            "sadness": "Sad",
            "sad": "Sad",
            "fearful": "Fear",
            "fear": "Fear",
            "disgusted": "Disgust",
            "disgust": "Disgust",
            "surprised": "Surprise",
            "surprise": "Surprise",
            "neutral": "Neutral",
        }
        return aliases.get(value, str(label).strip().title())

    @staticmethod
    def _smile_confidence(face_roi):
        if _smile_cascade.empty() or face_roi is None or face_roi.size == 0:
            return 0.0
        try:
            smiles = _smile_cascade.detectMultiScale(
                face_roi,
                scaleFactor=1.4,
                minNeighbors=8,
                minSize=(14, 8),
            )
        except Exception:
            return 0.0
        if len(smiles) == 0:
            return 0.0
        face_area = max(1, face_roi.shape[0] * face_roi.shape[1])
        widest = max(smiles, key=lambda r: r[2] * r[3])
        _, _, w, h = widest
        ratio = (w * h) / face_area
        return min(0.98, 0.42 + ratio * 3.0)
