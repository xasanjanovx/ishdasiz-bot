const ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api';

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Get Eskiz API token (with caching)
 */
export async function getEskizToken(): Promise<string | null> {
    const email = process.env.ESKIZ_EMAIL;
    const password = process.env.ESKIZ_PASSWORD;

    // Dev mode: no credentials
    if (!email || !password) {
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
            const errorText = await res.text();
            console.error('Eskiz auth failed:', res.status, errorText);
            return null;
        }

        const data = await res.json();
        if (data.data?.token) {
            cachedToken = data.data.token;
            // Token valid for 30 days, cache for 29 days
            tokenExpiresAt = Date.now() + 29 * 24 * 60 * 60 * 1000;
            return cachedToken;
        }
        return null;
    } catch (error) {
        console.error('Failed to get Eskiz token:', error);
        return null;
    }
}

/**
 * Send SMS via Eskiz.uz
 * In dev mode (no ENV vars): logs to console instead of sending
 */
export async function sendSMS(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
    const email = process.env.ESKIZ_EMAIL;
    const password = process.env.ESKIZ_PASSWORD;

    // DEV MODE: No credentials - just log
    if (!email || !password) {
        console.log('==========================================');
        console.log('📧 DEV MODE - SMS NOT SENT');
        console.log(`📱 To: ${phone}`);
        console.log(`💬 Message: ${message}`);
        console.log('==========================================');
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
            const errText = await res.text();
            console.error('Eskiz send error:', errText);

            let errorMessage = 'SMS send failed';
            try {
                const json = JSON.parse(errText);
                errorMessage = json.message || json.status || errText;
            } catch (e) {
                errorMessage = errText;
            }

            return { success: false, error: errorMessage };
        }

        const result = await res.json();
        console.log('📱 SMS sent successfully:', result);
        return { success: true };
    } catch (error) {
        console.error('Eskiz send exception:', error);
        return { success: false, error: 'Network exception' };
    }
}

/**
 * Generate OTP code (5 digits)
 * In dev mode: returns predictable "12345"
 */
export function generateOTP(): string {
    // Dev mode: predictable code for testing
    if (!process.env.ESKIZ_EMAIL) {
        return "12345";
    }
    // 5-digit code
    return Math.floor(10000 + Math.random() * 90000).toString();
}

/**
 * Get SMS message text from ENV or default
 */
export function getSMSText(code: string): string {
    const template = process.env.ESKIZ_SMS_TEXT || 'ishdasiz.uz saytiga kirish uchun tasdiqlash kodi:';
    return `${template} ${code}`;
}
