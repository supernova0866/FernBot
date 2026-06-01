const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Respond to incoming pings
app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(PORT, () => {
    console.log(`Keep-alive server running on port ${PORT}`);
});

// Ping the partner's Render URL every 5 minutes
const PARTNER_URL = process.env.PARTNER_PING_URL;

if (PARTNER_URL) {
    setInterval(() => {
        fetch(`${PARTNER_URL}/ping`)
            .then(() => console.log(`Pinged partner at ${PARTNER_URL}`))
            .catch(err => console.error('Partner ping failed:', err));
    }, 5 * 60 * 1000);
} else {
    console.warn('PARTNER_PING_URL not set, mutual ping disabled.');
}
