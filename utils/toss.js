const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

export function tossAuthHeader() {
  const token = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  return `Basic ${token}`;
}