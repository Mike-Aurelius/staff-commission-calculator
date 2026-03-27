import { Resend } from "resend";
import { StaffCommission } from "./types";

const fmt = {
  currency: (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" }),
  percent: (r: number) => `${(r * 100).toFixed(0)}%`,
};

function buildHtmlEmail(period: string, commissions: StaffCommission[]): string {
  const totalPayout = commissions.reduce((s, c) => s + c.commissionAmount, 0);

  const rows = commissions
    .map((c) => {
      const highlight = c.commissionAmount > 0 ? "" : ' style="color:#9ca3af;"';
      return `
      <tr${highlight}>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:500;">${c.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.orderCount}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt.currency(c.totalSales)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt.currency(c.avgOrderValue)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.tier}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:${c.commissionAmount > 0 ? "#059669" : "#9ca3af"};">${fmt.currency(c.commissionAmount)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Staff Commission Report — ${period}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="700" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden;max-width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1e293b;padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                Staff Commission Report
              </h1>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:14px;">${period}</p>
            </td>
          </tr>

          <!-- Commission table -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Staff Member</th>
                    <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Orders</th>
                    <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Total Sales</th>
                    <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Avg Order</th>
                    <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Tier</th>
                    <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Total payout -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:14px 14px;background:#f8fafc;border-radius:0 0 6px 6px;text-align:right;">
                    <span style="font-size:14px;color:#475569;margin-right:16px;">Total Payout</span>
                    <span style="font-size:18px;font-weight:700;color:#1e293b;">${fmt.currency(totalPayout)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tier legend -->
          <tr>
            <td style="padding:0 32px 32px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Commission Tiers</p>
              <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#475569;">
                <tr>
                  <td style="padding:3px 24px 3px 0;">$65–$74.99 avg order → <strong>5%</strong> of (avg − $65) × orders</td>
                </tr>
                <tr>
                  <td style="padding:3px 24px 3px 0;">$75–$84.99 avg order → <strong>10%</strong> of (avg − $65) × orders</td>
                </tr>
                <tr>
                  <td style="padding:3px 24px 3px 0;">$85+ avg order → <strong>15%</strong> of (avg − $65) × orders</td>
                </tr>
              </table>
              <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">Store leads (Lexx, Najwa, Angela) are excluded from commission.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Generated automatically on the 1st of each month · Staff Commission Calculator
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCommissionEmail(
  resendApiKey: string,
  fromAddress: string,
  toAddress: string,
  period: string,
  commissions: StaffCommission[]
): Promise<void> {
  const resend = new Resend(resendApiKey);

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: toAddress,
    subject: `Staff Commission Report — ${period}`,
    html: buildHtmlEmail(period, commissions),
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`✓ Commission report for ${period} sent to ${toAddress}`);
}
