// @ts-nocheck
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || "NestMatch <onboarding@resend.dev>";

let resend: Resend | null = null;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtpEmail(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.error("RESEND_API_KEY is not set");
    return { ok: false, error: "Email service not configured. Set RESEND_API_KEY." };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Your NestMatch login code",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 8px; color: #111;">NestMatch login code</h2>
          <p style="color: #444; margin: 0 0 16px;">Use this 6-digit code to sign in. It expires in 10 minutes.</p>
          <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; background: #f4f4f5; border-radius: 8px; margin-bottom: 16px;">
            ${code}
          </div>
          <p style="color: #666; font-size: 13px; margin: 0;">
            If you did not request this code, you can ignore this email.
            <br />First time receiving codes from us? Check your spam/junk folder.
          </p>
        </div>
      `,
      text: `Your NestMatch login code is ${code}. It expires in 10 minutes. First time? Check your spam folder.`,
    });

    if (error) {
      console.error("Resend error:", error);
      return { ok: false, error: error.message || "Failed to send email" };
    }

    console.log("OTP email sent:", data?.id);
    return { ok: true };
  } catch (err: any) {
    console.error("Send OTP failed:", err);
    return { ok: false, error: err.message || "Failed to send email" };
  }
}
