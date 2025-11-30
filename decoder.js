const https = require('https');
const http = require('http');
const url = require('url');
const mime = require('mime-types');

// Function to decode URL and find file extension by Content-Type
function getFileExtensionByContentType(urlString) {
    try {
        // Decode the URL
        const decodedUrl = decodeURIComponent(urlString);

        // Parse the URL to get the protocol
        const parsedUrl = url.parse(decodedUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        // Perform HEAD request to fetch headers including Content-Type
        protocol.request(
            { method: 'HEAD', host: parsedUrl.host, path: parsedUrl.path },
            (res) => {
                // Check the Content-Type header
                const contentType = res.headers['content-type'];
                if (contentType) {
                    // Get the file extension from Content-Type
                    const extension = mime.extension(contentType);
                    if (extension) {
                        console.log(`File extension by Content-Type: .${extension}`);
                    } else {
                        console.log('Could not determine the file extension from Content-Type');
                    }
                } else {
                    console.log('Content-Type header not found');
                }
            }
        ).on('error', (err) => {
            console.error('Error fetching the URL:', err.message);
        }).end();
    } catch (error) {
        console.error('Error decoding the URL:', error);
    }
}

// Test the function with an example URL
const urlString = 'https://mms.twiliocdn.com/AC9f10e22cf1b500ee219526db55a7c523/adf5568e022e56da0ec5c80b2e928cce?Expires=1727799246&Signature=VptldmqsywFC8Ps-F9PkpTIPXWTdY4RTYrJAetFUT5bQk01scWwGcS2vmlvaHYU81fvDQ8aAJY6XM3CL62YrdRBohVijDDt7kxtYlIOgfuDSFP8OU2t7Rbkaz5jD3q8ilCdm-bDUb2lYlgRfeEq5cXAD3NhLz-oE67FgU1YaFsKtgSfyWeXwR24xUWhkYLRbfd2fCKWld5q4l%7Eq1v45Ip-4kfp3lMX-LwJq7wv7-BfhO0uUWSecU-cFHqOzylk6L051L35GRZ6abVlAQTfbCcnb5fx%7EjH0mGr7VB7meEn3MT30P5A9x5eUG3fRRsGNAvrVqqg%7EKbsvUyOo-vqRUkZg__&Key-Pair-Id=APKAIRUDFXVKPONS3KUA';
getFileExtensionByContentType(urlString);
