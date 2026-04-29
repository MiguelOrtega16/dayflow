export function buildEmailHtml(title: string, message: string, ctaText?: string, ctaUrl?: string) {
  const cta = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">${ctaText}</a>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#1a1a24;border-radius:16px;overflow:hidden;border:1px solid #2a2a3a">
    <div style="background:linear-gradient(135deg,#6366f1,#7c3aed);padding:28px 32px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">📅</div>
      <span style="color:#fff;font-size:20px;font-weight:700">DayFlow</span>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;color:#f1f1f8;font-size:18px;font-weight:600">${title}</h2>
      <p style="margin:0;color:#a0a0b8;font-size:14px;line-height:1.6">${message}</p>
      ${cta}
    </div>
    <div style="padding:16px 32px 24px;color:#505068;font-size:12px">
      Puedes desactivar las notificaciones por correo en <strong>Configuración</strong> dentro de DayFlow.
    </div>
  </div>
</body>
</html>`
}

export async function sendNotificationEmail(payload: {
  recipientId: string
  senderName: string
  subject: string
  title: string
  message: string
  ctaText?: string
  ctaUrl?: string
}) {
  const bodyHtml = buildEmailHtml(payload.title, payload.message, payload.ctaText, payload.ctaUrl)
  try {
    await fetch('/api/notify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: payload.recipientId,
        senderName:  payload.senderName,
        subject:     payload.subject,
        bodyHtml,
      }),
    })
  } catch {
    // Email is best-effort — never block the main action
  }
}
