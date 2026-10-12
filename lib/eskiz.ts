import { randomInt } from 'node:crypto';

const ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api';

export function isSmsDevMode(): boolean {
    const mode = String(process.env.NODE_ENV || '').toLowerCase();
    return (mode === 'development' || mode === 'test') && (!process.env.ESKIZ_EMAIL?.trim() || !process.env.ESKIZ_PASSWORD?.trim());
}

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Get Eskiz API token (with caching)
 */
export async function getEskizToken(): Promise<string | null> {
    const email = process.env.ESKIZ_EMAIL;
    const password = process.env.ESKIZ_PASSWORD;

    // Dev mode: no credentials
    if (!email?.trim() || !password?.trim()) {
        return null;
    }

    // Check cache
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    try {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const res = await fetch(`${ESKIZ_BASE_URL}/auth/login`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            console.error('Eskiz auth failed:', res.status);
            return null;
        }

        const data = await res.json();
        if (typeof data.data?.token === 'string' && data.data.token.trim()) {
            cachedToken = data.data.token;
            // Token valid for 30 days, cache for 29 days
            tokenExpiresAt = Date.now() + 29 * 24 * 60 * 60 * 1000;
            return cachedToken;
        }
        return null;
    } catch {
        console.error('Failed to get Eskiz token');
        return null;
    }
}

/**
 * Send SMS via Eskiz.uz
 * Explicit development/test mode can simulate delivery without credentials.
 * Never log phones, SMS bodies, tokens or raw provider responses/errors.
 */
export async function sendSMS(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
    const email = process.env.ESKIZ_EMAIL;
    const password = process.env.ESKIZ_PASSWORD;

    if (!email?.trim() || !password?.trim()) {
        if (!isSmsDevMode()) return { success: false, error: 'SMS credentials not configured' };
        console.log('SMS simulated in development/test mode');
        return { success: true };
    }

    // PROD MODE: Send real SMS
    const token = await getEskizToken();
    if (!token) {
        console.error('Could not get Eskiz token for sending SMS');
        return { success: false, error: 'Auth failed' };
    }

    // Eskiz expects phone without +
    const cleanPhone = phone.replace(/^\+/, '');

    try {
        const formData = new FormData();
        formData.append('mobile_phone', cleanPhone);
        formData.append('message', message);
        formData.append('from', process.env.ESKIZ_FROM || '4546');

        const res = await fetch(`${ESKIZ_BASE_URL}/message/sms/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                cachedToken = null;
                tokenExpiresAt = 0;
            }
            console.error('Eskiz send failed:', res.status);
            return { success: false, error: 'SMS send failed' };
        }

        await res.json();
        return { success: true };
    } catch {
        console.error('Eskiz send request failed');
        return { success: false, error: 'Network exception' };
    }
}

/**
 * Generate OTP code (5 digits)
 * In dev mode: returns predictable "12345"
 */
export function generateOTP(): string {
    // Dev mode: predictable code for testing
    if (isSmsDevMode()) {
        return "12345";
    }
    // 5-digit code
    return randomInt(10000, 100000).toString();
}

/**
 * Get SMS message text from ENV or default
 */
export function getSMSText(code: string): string {
    const template = process.env.ESKIZ_SMS_TEXT || 'ishdasiz.uz saytiga kirish uchun tasdiqlash kodi:';
    return `${template} ${code}`;
}
