const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Respond to incoming pings
app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Keep-alive server running on port ${PORT}`);
});

// Self-ping every 10 minutes to keep bot alive
setInterval(() => {
    fetch(`http://localhost:${PORT || 3000}/ping`)
        .then(() => console.log('Self-ping successful'))
        .catch(err => console.error('Self-ping failed:', err));
}, 10 * 60 * 1000);

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
