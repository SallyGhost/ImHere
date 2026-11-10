const localHosts = ["localhost", "127.0.0.1"];
window.IMHERE_API_BASE_URL = window.IMHERE_API_BASE_URL || (
  localHosts.includes(window.location.hostname)
    ? ""
    : "https://imhere-api.ilya64misko.workers.dev"
);
