const cron = require('node-cron');
const axios = require('axios');

// First Task: Sync Yesterday Attendance at 2:00 AM
cron.schedule('01 08 * * *', async () => {
    console.log('Syncing attendance....');

    try {
        const response = await axios.get('http://172.16.20.13:8080/api/attenedence/sync-yesterday');
        console.log('Sync successful:', response.data);
    } catch (error) {
        console.error('Error syncing attendance:', error.message);
    }
}, {
    scheduled: true,
    timezone: "Asia/Dubai"
});
// Second Task: Process Attendance at 3:00 AM
cron.schedule('03 08 * * *', async () => {
    console.log('Processing Attendance.....');

    try {
        const response = await axios.get('http://172.16.20.13:8080/api/attenedence/process-attendance');
        console.log('Process successful:', response.data);
    } catch (error) {
        console.error('Error processing attendance:', error.message);
    }
}, {
    scheduled: true,
    timezone: "Asia/Dubai"
});
// // Second Task: Process Attendance at 3:00 AM
cron.schedule('05 08 * * *', async () => {
    console.log('Process All Attendance.....');

    try {
        const response = await axios.put('http://172.16.20.13:8080/api/attenedence/process-all');
        console.log('Process successful:', response.data);
    } catch (error) {
        console.error('Error processing attendance:', error.message);
    }
}, {
    scheduled: true,
    timezone: "Asia/Dubai"
});
// // Second Task: Process Attendance at 3:00 AM
cron.schedule('07 08 * * *', async () => {
    console.log('Gernerate Attendance.....');

    try {
        const response = await axios.get('http://172.16.20.13:8080/api/attenedence/generate');
        console.log('Process successful:', response.data);
    } catch (error) {
        console.error('Error processing attendance:', error.message);
    }
}, {
    scheduled: true,
    timezone: "Asia/Dubai"
});
// // Second Task: Process Attendance at 3:00 AM
cron.schedule('09 08 * * *', async () => {
    console.log('Process Single Attendance.....');

    try {
        const response = await axios.post('http://172.16.20.13:8080/api/attenedence/process-single');
        console.log('Process successful:', response.data);
    } catch (error) {
        console.error('Error processing attendance:', error.message);
    }
}, {
    scheduled: true,
    timezone: "Asia/Dubai"
});
console.log('Attendance sync and process cron jobs scheduled.');