    import { parentPort, workerData } from 'worker_threads';
    import axios from 'axios'; 
    import 'dotenv/config';

    (async () => {
        if (!workerData || !workerData.users || !workerData.messageTemplateParams) return;

        const { users, messageTemplateParams, templateName } = workerData;
        const failedMessages: any[] = [];

        for (const user of users) {
            let mobile = user.mobile ? user.mobile.toString().trim() 
            : user.phone ? user.phone.toString().trim() 
            : null;

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
                // Construct the Gupshup API payload
                const payload = {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: `971${mobile}`, // Correct format for the recipient number
                    type: "template",
                    template: {
                        name: templateName,
                        language: { code: "en" },
                        components: [
                            {
                                type: "header",
                                parameters: [
                                    {
                                        type: "image",
                                        image: {
                                            link: messageTemplateParams[4]
                                        }
                                    }
                                ]
                            },
                            {
                                type: "body",
                                parameters: [
                                    { type: "text", text: messageTemplateParams[1] },
                                    { type: "text", text: messageTemplateParams[2] },
                                    { type: "text", text: messageTemplateParams[3] }
                                ]
                            },
                            templateName === 'alletre_auction_utility_templet_two'
                                ? {
                                      type: "button",
                                      sub_type: "url",
                                      index: 0,
                                      parameters: [
                                          {
                                              type: "text",
                                              text: `${messageTemplateParams[5]}`
                                          }
                                      ]
                                  }
                                : null
                        ].filter(Boolean) // Removes null/false values
                    }
                };
                

                // Send the request to Gupshup
                const response = await axios.post(
                    'https://partner.gupshup.io/partner/app/196a6e5a-95bf-4ba8-8a30-0f8627d75447/v3/message',
                    payload,
                    {
                        headers: {
                            'accept': 'application/json',
                            'Authorization': 'sk_808029f6198240c788d9037099017a4a',
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // Log response or handle success/failure
                console.log(`Message sent to ${user.mobile}:`, response.data);
            } catch (error) {
                console.log(`Failed to send message to: ${user.mobile} | Error: ${error.message}`);
                failedMessages.push({ user: user.mobile, error: error.message });
            }
        }

        parentPort?.postMessage({ success: true, failedMessages });
    })();
