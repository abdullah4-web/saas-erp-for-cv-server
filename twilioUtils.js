const twilio = require('twilio');
const axios = require('axios');

const accountSid = "AC5422ad69b453e53f15958313f847aa7d";
const authToken = "29b5b044d81a7b215decc24565456e4f";

const client = twilio(accountSid, authToken);

async function getMedia(messageSid, mediaSid) {
    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/${mediaSid}`;
        const response = await axios.get(url, {
            auth: {
                username: accountSid,
                password: authToken,
            },
            responseType: 'arraybuffer', // Retrieve media as binary data
        });
        
        return {
            body: response.data,
            headers: response.headers // Return headers along with the data
        };
    } catch (error) {
        throw new Error('Failed to fetch media from Twilio: ' + error.message); // Include error message for debugging
    }
}

module.exports = {
    getMedia,
};
