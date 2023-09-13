document.addEventListener("StartTestRecord", function (e) {
  chrome.runtime.sendMessage({ type: "StartTestRecord", timeout: e.detail.timeout });
  console.log("Sending Message to BG", e);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Got Message from Extension", message);
  if (message?.type == "FinishTestRecord") {
    setTimeout(() => {
      console.log("RecordDetails", { details: message.details });
      console.log("FinishTestRecord");
    }, 1000);
  }
  if (message?.type == "Log") {
    console.log("From Extension:", message);
  }
});
