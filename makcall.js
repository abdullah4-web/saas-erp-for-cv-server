// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
// const accountSid = process.env.TWILIO_ACCOUNT_SID;
// const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio('AC48e99fa5d2a4ecdd660e8f5391e375ed', 'e238c6458f718cbe03916aaeb597283c');

async function createCall() {
  const call = await client.calls.create({
    from: "+12404716634",
    to: "+971503068186",
    url: "http://demo.twilio.com/docs/voice.xml",
  });

  console.log(call.sid);
}

createCall();