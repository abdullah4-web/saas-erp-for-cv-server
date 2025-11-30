const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const clientId = 'e7e2097b764d0b598b0a988fc5bf2a02';
const clientSecret = '8b211db3b96a9ceeaae3b5f172fc429d';

async function getAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'apioauth');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  const response = await axios.post(
    'https://apihub.etisalat.ae:9443/etisalat/serviceapis/confidential/oauth2/token',
    params,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}

async function checkDNCRNumber(accountNumbers) {
  const token = await getAccessToken();
  const payload = {
    accountNumber: accountNumbers, // pass array of numbers here
    count: '50',
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    clientID: clientId,
    'X-TIB-TransactionID': uuidv4(),
    'X-TIB-RequestedSystem': 'Motive',
    'Content-Type': 'application/json',
  };

  const response = await axios.post(
    'https://apis.etisalat.ae:9443/etisalat/serviceapis/dncr/v0/check',
    payload,
    { headers }
  );

  console.log('DNCR Response:', response.data);
}

// You can call the function like this:
const payloadNumbers = ['0503068186', '0507101207']; // Add your numbers here
checkDNCRNumber(payloadNumbers).catch(console.error);
