import { readFileSync } from 'node:fs';

export const MEMBER_PREMIUM_VERSION = '2026-11';
export const MEMBER_PREMIUM_PARTNER = 'PDB Aesthetic Room, Inhaberin Noureen Hussain';
export const memberPremiumText = readFileSync(new URL('../legal/member-premium-2026-11.txt', import.meta.url), 'utf8');
const withdrawalStart = memberPremiumText.indexOf('ANLAGE 2 · WIDERRUFSBELEHRUNG');
if (withdrawalStart < 0) throw new Error('MEMBER_PREMIUM_WITHDRAWAL_TEXT_MISSING');

export function escapeLegalHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderLegalText(text) {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === 'Behandlung' && lines[i + 1] === 'Umfang je Behandlung') {
      output.push('<table><thead><tr><th scope="col">Behandlung</th><th scope="col">Umfang je Behandlung</th></tr></thead><tbody>');
      i += 2;
      while (i < lines.length && !/^(PURE|DEFINE|BEYOND|PRIVATE|Zonen-Einteilung Laser-Haarentfernung)$/.test(lines[i])) {
        output.push(`<tr><td>${escapeLegalHtml(lines[i])}</td><td>${escapeLegalHtml(lines[i + 1])}</td></tr>`);
        i += 2;
      }
      output.push('</tbody></table>');
      i -= 1;
    } else if (/^(§ \d+|ANLAGE [12]|PURE$|DEFINE$|BEYOND$|PRIVATE$|Zonen-Einteilung|Areal-Einteilung|Widerrufsrecht$|Folgen des Widerrufs$|Muster-Widerrufsformular$)/.test(line)) {
      output.push(`<h2>${escapeLegalHtml(line)}</h2>`);
    } else {
      output.push(`<p>${escapeLegalHtml(line)}</p>`);
    }
  }
  return output.join('\n');
}

export const memberPremiumTermsHtml = renderLegalText(memberPremiumText.slice(0, withdrawalStart));
export const memberPremiumWithdrawalHtml = renderLegalText(memberPremiumText.slice(withdrawalStart));
export const memberPremiumFullHtml = memberPremiumTermsHtml + '\n' + memberPremiumWithdrawalHtml;
