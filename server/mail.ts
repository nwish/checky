import nodemailer from 'nodemailer'

// Real SMTP when configured; otherwise a json transport so emails are visible
// in the server log (dev / first-run).
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === '1',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined
    })
  : nodemailer.createTransport({ jsonTransport: true })

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST)
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'Checky <checky@localhost>'
  await transport.sendMail({ from, to, subject, text, html })
  if (!process.env.SMTP_HOST) {
    console.warn('[mail] SMTP_HOST not set — email to %s was NOT sent (subject: %s)\n%s', to, subject, text)
  }
}

function inviteUrl(link: string): URL {
  const url = new URL(link)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('invite link must use http or https')
  }
  return url
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]!)
}

export function inviteMail(link: string): { subject: string; text: string; html: string } {
  const inviteLink = inviteUrl(link).href
  const subject = "You're invited to Checky"
  const text = [
    'You have been invited to join Checky.',
    '',
    `Set your password to activate your account: ${inviteLink}`,
    '',
    'This link is single-use. If you did not expect this invitation, you can ignore this email.'
  ].join('\n')
  const html = [
    '<p>You have been invited to join Checky.</p>',
    `<p><a href="${escapeHtml(inviteLink)}">Set your password</a> to activate your account.</p>`,
    '<p>This link is single-use. If you did not expect this invitation, you can ignore this email.</p>'
  ].join('\n')
  return { subject, text, html }
}
