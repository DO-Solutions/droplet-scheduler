import nodemailer from "nodemailer";
import { getSetting } from "./db";
import type { Report } from "./db";

export async function sendReportEmail(
  reports: Report[],
  subject: string
): Promise<void> {
  const smtpConfig = getSetting("smtp_config");
  if (!smtpConfig) return;

  let config: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    to: string;
  };

  try {
    config = JSON.parse(smtpConfig);
  } catch {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  const rows = reports
    .map(
      (r) =>
        `<tr>
      <td style="padding:8px;border:1px solid #ddd">${r.event_type}</td>
      <td style="padding:8px;border:1px solid #ddd">${r.droplet_name}</td>
      <td style="padding:8px;border:1px solid #ddd">${new Date(r.timestamp * 1000).toUTCString()}</td>
      <td style="padding:8px;border:1px solid #ddd">${r.status}</td>
      <td style="padding:8px;border:1px solid #ddd">${r.details ?? ""}</td>
      <td style="padding:8px;border:1px solid #ddd">${r.health_check_result ?? "N/A"}</td>
    </tr>`
    )
    .join("\n");

  const html = `
    <h2>DigitalOcean Lifecycle Scheduler Report</h2>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #ddd;background:#f4f4f4">Event</th>
          <th style="padding:8px;border:1px solid #ddd;background:#f4f4f4">Droplet</th>
          <th style="padding:8px;border:1px solid #ddd;background:#f4f4f4">Timestamp</th>
          <th style="padding:8px;border:1px solid #ddd;background:#f4f4f4">Status</th>
          <th style="padding:8px;border:1px solid #ddd;background:#f4f4f4">Details</th>
          <th style="padding:8px;border:1px solid #ddd;background:#f4f4f4">Health Check</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject,
    html,
  });
}
