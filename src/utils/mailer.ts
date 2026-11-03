import tls from 'node:tls';
import net from 'node:net';

export interface EmailDispatchResult {
  sent: boolean;
  provider: 'resend' | 'brevo' | 'smtp' | 'none';
  error?: string;
}

function buildHtmlEmail(params: {
  title: string;
  subtitle: string;
  playerId: string;
  code: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #090d16; color: #f8fafc; border-radius: 16px; padding: 28px; border: 1px solid rgba(251, 191, 36, 0.25);">
      <h2 style="margin: 0 0 8px; color: #fbbf24; font-size: 20px;">${params.title}</h2>
      <p style="margin: 0 0 20px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">${params.subtitle}</p>
      <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">Your Player ID</div>
        <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #fcd34d; margin-bottom: 14px;">${params.playerId}</div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">6-Digit Security Code</div>
        <div style="font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #34d399;">${params.code}</div>
      </div>
      <p style="margin: 0; color: #64748b; font-size: 12px;">This code expires in 15 minutes. Never share this code with anyone.</p>
    </div>
  `;
}

async function sendViaSmtp(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const isImplicitTls = params.port === 465;
    const socket: net.Socket | tls.TLSSocket = isImplicitTls
      ? tls.connect({ host: params.host, port: params.port, servername: params.host })
      : net.createConnection({ host: params.host, port: params.port });

    let activeSocket: net.Socket | tls.TLSSocket = socket;
    let step = 0;
    let resolved = false;

    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      try {
        activeSocket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), 8000);

    const sendLine = (line: string) => {
      activeSocket.write(line + '\r\n');
    };

    const onData = (buf: Buffer) => {
      const text = buf.toString('utf8');
      const code = parseInt(text.slice(0, 3), 10);
      // Wait if multiline response is not finished
      const lines = text.trim().split('\r\n');
      const lastLine = lines[lines.length - 1] || '';
      if (lastLine.length >= 4 && lastLine[3] === '-') return;

      if (step === 0 && code === 220) {
        step = isImplicitTls ? 2 : 1;
        sendLine(`EHLO royalkatti.app`);
      } else if (step === 1 && code === 250) {
        step = 15;
        sendLine('STARTTLS');
      } else if (step === 15 && code === 220) {
        activeSocket.removeAllListeners('data');
        const tlsSock = tls.connect({
          socket: activeSocket,
          servername: params.host,
        });
        activeSocket = tlsSock;
        tlsSock.on('data', onData);
        tlsSock.on('error', () => {
          clearTimeout(timeout);
          finish(false);
        });
        step = 2;
        sendLine('EHLO royalkatti.app');
      } else if (step === 2 && code === 250) {
        step = 3;
        sendLine('AUTH LOGIN');
      } else if (step === 3 && code === 334) {
        step = 4;
        sendLine(Buffer.from(params.user, 'utf8').toString('base64'));
      } else if (step === 4 && code === 334) {
        step = 5;
        sendLine(Buffer.from(params.pass, 'utf8').toString('base64'));
      } else if (step === 5 && code === 235) {
        step = 6;
        sendLine(`MAIL FROM:<${params.from}>`);
      } else if (step === 6 && code === 250) {
        step = 7;
        sendLine(`RCPT TO:<${params.to}>`);
      } else if (step === 7 && (code === 250 || code === 251)) {
        step = 8;
        sendLine('DATA');
      } else if (step === 8 && code === 354) {
        step = 9;
        const message = [
          `From: "Royal Katti VIP" <${params.from}>`,
          `To: <${params.to}>`,
          `Subject: ${params.subject}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=utf-8`,
          ``,
          params.html,
          `.`,
        ].join('\r\n');
        sendLine(message);
      } else if (step === 9 && code === 250) {
        step = 10;
        sendLine('QUIT');
        clearTimeout(timeout);
        finish(true);
      } else if (code >= 400) {
        clearTimeout(timeout);
        finish(false);
      }
    };

    activeSocket.on('data', onData);
    activeSocket.on('error', () => {
      clearTimeout(timeout);
      finish(false);
    });
  });
}

export async function sendVerificationEmail(params: {
  to: string;
  playerId: string;
  code: string;
  purpose: 'verify' | 'reset';
}): Promise<EmailDispatchResult> {
  const subject =
    params.purpose === 'verify'
      ? `${params.code} is your Royal Katti verification code`
      : `${params.code} is your Royal Katti password reset code`;

  const html = buildHtmlEmail({
    title:
      params.purpose === 'verify'
        ? 'Verify Your Royal Katti Account'
        : 'Reset Your Royal Katti Password',
    subtitle:
      params.purpose === 'verify'
        ? 'Enter the 6-digit verification code below in the Royal Katti app to activate your Player ID.'
        : 'Enter the 6-digit password reset code below in the Royal Katti app to set a new password.',
    playerId: params.playerId,
    code: params.code,
  });

  // 1. Resend API (RESEND_API_KEY)
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const fromAddr = process.env.EMAIL_FROM?.trim() || 'Royal Katti <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [params.to],
          subject,
          html,
        }),
      });
      if (res.ok) {
        return { sent: true, provider: 'resend' };
      }
    } catch {
      // fall through
    }
  }

  // 2. Brevo API (BREVO_API_KEY)
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (brevoKey) {
    try {
      const senderEmail = process.env.EMAIL_FROM?.trim() || 'noreply@royalkatti.app';
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Royal Katti VIP', email: senderEmail },
          to: [{ email: params.to }],
          subject,
          htmlContent: html,
        }),
      });
      if (res.ok) {
        return { sent: true, provider: 'brevo' };
      }
    } catch {
      // fall through
    }
  }

  // 3. Direct SMTP (SMTP_USER + SMTP_PASS, defaults to smtp.gmail.com:465)
  const smtpUser = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
  if (smtpUser && smtpPass) {
    const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const ok = await sendViaSmtp({
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      from: (process.env.EMAIL_FROM || smtpUser).trim(),
      to: params.to,
      subject,
      html,
    });
    if (ok) {
      return { sent: true, provider: 'smtp' };
    }
  }

  console.info(
    `[Email Dispatch] To: ${params.to} | PlayerID: ${params.playerId} | ${params.purpose.toUpperCase()} Code: ${params.code}`
  );
  return { sent: false, provider: 'none' };
}
