let intervalId;
let timeoutId;

const cleanUp = () => {
  if (intervalId) clearInterval(intervalId);
  if (timeoutId) clearTimeout(timeoutId);
};

const fetchStatus = async () => {
  console.log('Polling Render deployment status...');
  try {
    const res = await fetch('https://mvss-erp-backend.onrender.com/api');
    if (res.ok) {
      const data = await res.json();
      console.log('Current status:', data);
      if (data.success === true) {
        console.log('✅ Backend deployment is live and healthy.');
        cleanUp();
        setTimeout(() => process.exit(0), 100);
      }
    } else {
      console.error('Fetch failed with status:', res.status);
      cleanUp();
      setTimeout(() => process.exit(1), 100);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    cleanUp();
    setTimeout(() => process.exit(1), 100);
  }
};

// Set a max timeout of 10 minutes to prevent infinite loops
timeoutId = setTimeout(() => {
  console.error('Timeout: Polling exceeded 10 minutes.');
  cleanUp();
  setTimeout(() => process.exit(1), 100);
}, 600000); // 10 minutes

intervalId = setInterval(fetchStatus, 10000);
fetchStatus();
