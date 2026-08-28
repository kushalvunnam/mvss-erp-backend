const fetchStatus = async () => {
  console.log('Polling Render deployment status...');
  try {
    const res = await fetch('https://mvss-erp-backend.onrender.com/api');
    if (res.ok) {
      const data = await res.json();
      console.log('Current status:', data);
      if (data.commit) {
        console.log('DEPLOYMENT IS LIVE! Version:', data.commit);
        process.exit(0);
      }
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
};

setInterval(fetchStatus, 10000);
fetchStatus();
