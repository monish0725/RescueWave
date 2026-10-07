"""Optional direct alert channels for the AI CCTV service.

The backend remains the primary RescueWave alerting path. These SMTP/Twilio
hooks mirror the original prototype objective as an extra demo/backup layer,
configured only through environment variables.
"""
import logging
import smtplib
from email.message import EmailMessage

from .config import config

log = logging.getLogger("rescuewave_ai.notifier")


def _smtp_enabled():
    return bool(config.SMTP_USERNAME and config.SMTP_PASSWORD and config.ALERT_EMAIL_TO)


def _twilio_enabled():
    return bool(config.TWILIO_SID and config.TWILIO_AUTH and config.TWILIO_FROM and config.TWILIO_TO)


def send_direct_alert(subject: str, body: str, call_message: str = "RescueWave emergency detected. Send assistance."):
    if _smtp_enabled():
        _send_email(subject, body)
    else:
        log.info("SMTP alert skipped; set SMTP_USERNAME, SMTP_PASSWORD and ALERT_EMAIL_TO to enable it.")

    if _twilio_enabled():
        _send_twilio_sms(body)
        _send_twilio_calls(call_message)
    else:
        log.info("Twilio alert skipped; set TWILIO_SID, TWILIO_AUTH, TWILIO_FROM and TWILIO_TO to enable it.")


def _send_email(subject: str, body: str):
    try:
        msg = EmailMessage()
        msg["From"] = config.SMTP_USERNAME
        msg["To"] = ", ".join(config.ALERT_EMAIL_TO)
        msg["Subject"] = subject
        msg.set_content(body)

        with smtplib.SMTP(config.SMTP_SERVER, config.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            server.send_message(msg)
        log.warning("📧 SMTP alert sent to %s", ", ".join(config.ALERT_EMAIL_TO))
    except Exception as e:
        log.error("SMTP alert failed: %s", e)


def _send_twilio_sms(body: str):
    try:
        from twilio.rest import Client

        client = Client(config.TWILIO_SID, config.TWILIO_AUTH)
        for phone in config.TWILIO_TO:
            client.messages.create(body=body[:1500], from_=config.TWILIO_FROM, to=phone)
        log.warning("📲 Twilio SMS sent to %s", ", ".join(config.TWILIO_TO))
    except ImportError:
        log.error("Twilio package not installed. Run: pip install twilio")
    except Exception as e:
        log.error("Twilio SMS failed: %s", e)


def _send_twilio_calls(message: str):
    if not config.TWILIO_CALL_TO:
        return
    try:
        from twilio.rest import Client

        client = Client(config.TWILIO_SID, config.TWILIO_AUTH)
        twiml = f"<Response><Say>{message}</Say></Response>"
        for phone in config.TWILIO_CALL_TO:
            client.calls.create(twiml=twiml, from_=config.TWILIO_FROM, to=phone)
        log.warning("☎️ Twilio calls started to %s", ", ".join(config.TWILIO_CALL_TO))
    except ImportError:
        log.error("Twilio package not installed. Run: pip install twilio")
    except Exception as e:
        log.error("Twilio call failed: %s", e)
