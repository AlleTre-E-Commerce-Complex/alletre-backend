import { parentPort, workerData } from 'worker_threads';
import { Twilio } from 'twilio';
import 'dotenv/config';

const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
    if (!workerData || !workerData.users || !workerData.messageTemplateParams) return;

    const { users, messageTemplateParams, fromNumber, contentSid } = workerData;
    const failedMessages: any[] = [];

    for (const user of users) {
        let mobile = user.mobile.toString().trim();

        if (mobile.startsWith('+971')) {
            mobile = mobile.substring(4);
        } else if (mobile.startsWith('0')) {
            mobile = mobile.substring(1);
        }

        if (!/^\d{9}$/.test(mobile)) {
            console.log(`Invalid number skipped: ${user.mobile}`);
            failedMessages.push({ user: user.mobile, error: 'Invalid UAE number format' });
            continue;
        }

        try {
            await client.messages.create({
                from: fromNumber,
                to: `whatsapp:+971${mobile}`,
                contentSid,
                contentVariables: JSON.stringify(messageTemplateParams),
            });
        } catch (error) {
            console.log(`Failed to send message to: ${user.mobile} | Error: ${error.message}`);
            failedMessages.push({ user: user.mobile, error: error.message });
        }
    }

    parentPort?.postMessage({ success: true, failedMessages });
})();
