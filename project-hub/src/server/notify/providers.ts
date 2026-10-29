import "server-only";
import { systemDb, schema } from "../db";

export type EmailMessage = { to: string; subject: string; text: string; html?: string; tenantId?: string | null; fromDisplay?: string | null };
export type SendResult = { providerMessageId: string; provider: string };

export class ProviderError extends Error {
  constructor(public retryable: boolean, message: string) {
    super(message);
  }
}

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<SendResult>;
}

export type SmsMessage = { to: string; body: string; senderId: string; tenantId: string };
export interface SmsProvider {
  name: string;
  send(msg: SmsMessage): Promise<SendResult & { segments: number }>;
}

/** Mock email: stores the message in dev_messages so demos can show it. Never leaves the server. */
class MockEmail implements EmailProvider {
  name = "mock-email";
  async send(msg: EmailMessage) {
    if (process.env.MOCK_EMAIL_FAIL === "1") throw new ProviderError(true, "mock email provider forced failure");
    const [row] = await systemDb()
      .insert(schema.devMessages)
      .values({ tenantId: msg.tenantId ?? null, channel: "email", to: msg.to, subject: msg.subject, body: msg.text })
      .returning({ id: schema.devMessages.id });
    return { provider: this.name, providerMessageId: row.id };
  }
}

class SmtpEmail implements EmailProvider {
  name = "smtp";
  async send(msg: EmailMessage) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.SMTP_URL!);
    const from = process.env.EMAIL_FROM ?? "Project Hub <no-reply@example.com>";
    try {
      const info = await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return { provider: this.name, providerMessageId: info.messageId };
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode ?? 0;
      const permanent = code >= 550 && code <= 554;
      throw new ProviderError(!permanent, (e as Error).message);
    }
  }
}

/** GSM-7 vs UCS-2 segment estimate (Arabic forces UCS-2: 70/67 chars per segment). */
export function smsSegments(body: string) {
  const ucs2 = /[^\u0000-\u007f]/.test(body);
  const single = ucs2 ? 70 : 160;
  const multi = ucs2 ? 67 : 153;
  const len = [...body].length;
  return len <= single ? 1 : Math.ceil(len / multi);
}

class MockSms implements SmsProvider {
  name = "mock-sms";
  async send(msg: SmsMessage) {
    if (process.env.MOCK_SMS_FAIL === "1") throw new ProviderError(true, "mock sms provider forced failure");
    const [row] = await systemDb()
      .insert(schema.devMessages)
      .values({ tenantId: msg.tenantId, channel: "sms", to: msg.to, subject: `from ${msg.senderId}`, body: msg.body })
      .returning({ id: schema.devMessages.id });
    return { provider: this.name, providerMessageId: row.id, segments: smsSegments(msg.body) };
  }
}

export function emailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "smtp" && process.env.SMTP_URL) return new SmtpEmail();
  return new MockEmail();
}

/** Only a mock exists. A live SMS adapter is blocked on sender registration and provider approval. */
export function smsProvider(): SmsProvider | null {
  return process.env.SMS_PROVIDER === "mock" || !process.env.SMS_PROVIDER ? new MockSms() : null;
}
