import { BrowserRecorder } from "@webrecorder/archivewebpage/src/ext/browser-recorder";

import { CollectionLoader } from "@webrecorder/wabac/src/loaders";

import { listAllMsg } from "@webrecorder/archivewebpage/src/utils";

import { Signer } from "@webrecorder/awp-sw";

import { generateS3Path, uploadFileToS3 } from "../services/awsService";

import { getLocalOption, removeLocalOption, setLocalOption } from "@webrecorder/archivewebpage/src/localstorage";
import { createInitialData, getJWTCookie, updateS3Info, reportS3Error, cancelRecord, initialScreenCaptureInfo } from "../api/recordersApi";

import { login, tokenValidation } from "../api/loginApi";
import { logger } from "../services/logger";
import behaviors from "browsertrix-behaviors/dist/behaviors.js";
import { CustomDownloader } from "./CustomDownloader";

import { BEHAVIOR_RUNNING } from "@webrecorder/archivewebpage/src/consts";

// ===========================================================================
const IMG_TYPE = "jpeg";
self.recorders = {};
self.newRecId = null;

let newRecUrl = null;
let newRecCollId = null;
let defaultCollId = null;

let autorun = false;
let screenshotBeforeRecord = true;
let ipAddress = null;
let inLogin = false;
let noRole = false;
let internalOnly = false;
let first_port = null;

const openWinMap = new Map();
const collLoader = new CollectionLoader();
const disabledCSPTabs = new Set();

chrome.runtime.onMessage.addListener(async function (message, sender, sendResponse) {
  if (message.type == "StartTestRecord") {
    const port = {
      postMessage: (message) => {
        // chrome.tabs.sendMessage(tabId,{type: "Log",...message});
        console.log("postMessage from automation:", message);
      },
    };
    first_port = port;
    const autorun = false;
    const tabId = sender.tab.id;
    await authentication();
    const { name } = await collLoader.initNewColl({ title: sender.url });
    defaultCollId = name;
    await setLocalOption("defaultCollId", defaultCollId);
    startRecorder(tabId, { collId: defaultCollId, port, autorun }, sender.url);
    setTimeout(() => {
      stopRecorder(tabId);
    }, message.timeout);
  }
});

async function getIpAddress() {
  if (ipAddress) return ipAddress;
  const rawResponse = await fetch("https://ipapi.co/ip/");
  ipAddress = await rawResponse.text();
  return ipAddress;
}

getIpAddress();

class CustomBrowserRecorder extends BrowserRecorder {
  getStatusMsg() {
    const retVal = super.getStatusMsg();
    retVal.uploadStatus = this.uploadStatus;
    retVal.adminLink = this.adminLink;
    if (this.isScreenshot == undefined) {
      this.isScreenshot = screenshotBeforeRecord;
    }
    retVal.isScreenshot = this.isScreenshot;
    return retVal;
  }

  postMessage(msg) {
    if (this.port != undefined) {
      this.port.postMessage(msg);
    } else {
      if (this.pendingMessages === undefined) {
        this.pendingMessages = [];
      }
      this.pendingMessages.push(msg);
      console.info("Port is undefined pending message", msg);
    }
  }

  _doDetach() {
    const otherExtensionIsRunning =
      Object.values(self.recorders).filter((rec) => {
        return rec.tabId != this.tabId && rec.running;
      }).length > 0;
    this.sizeNew = 0;
    return !otherExtensionIsRunning ? super._doDetach() : null;
  }

  openAdminLink = (link) => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTab = tabs[0];
      chrome.tabs.create({ url: link, index: activeTab.index + 1, active: false });
    });
  };

  async saveRecord() {
    const res = await createInitialData(this.pageInfo.url, await getIpAddress(), this.waczS3Path, internalOnly);
    if (res.errors && first_port) {
      first_port.postMessage({ type: "connection-error", status: "connection", details: res.errors });
    } else {
      this.archiveId = res.data.createInitialsData._id;
    }
  }

  async updateRecord(size, waczContent, publicationDate, socialMediaId, socialMediaHandle, platform, pageTitle) {
    const res = await updateS3Info(this.archiveId, size, waczContent, publicationDate, socialMediaId, socialMediaHandle, platform, pageTitle);
    if (res.errors) {
      if (res.errors?.[0]?.traceId) {
        const logtailLink = `https://logtail.com/team/${process.env.LOGTAIL_TEAM_ID}/tail?v=66947&q=traceid%3D"${result.errors[0]?.traceId}"`;
        this.sendNotification("Upload failed" + new Date().toLocaleString(), "logo.png", "Upload failed", "Click for details", () =>
          chrome.tabs.create({ url: logtailLink, active: true })
        );
      }
      first_port.postMessage({ type: "connection-error", status: "connection", details: res.errors });
    }
  }

  async uploadToS3() {
    this.postMessage({
      type: "upload",
      uploadStatus: (this.uploadStatus = true),
    });
    const coll = await this.collLoader.loadColl(this.collId);
    const pageList = [this.pageInfo.id];
    const softwareString = `Webrecorder ArchiveWeb.page ${__AWP_VERSION__}, using warcio.js ${__WARCIO_VERSION__}`;
    const signer = new Signer(softwareString);
    const dl = new CustomDownloader({
      coll,
      format: "wacz",
      pageList,
      signer,
      softwareString,
    });
    dl.setRecorder(this);
    if (this.canceled) return;
    const res = await dl.download();
    const details = dl.getRecordDetails();
    const socialMediaSites = ["facebook", "instagram", "twitter", "linkedin"];
    if (socialMediaSites.some((site) => this.pageInfo.url.includes(site))) {
      if (!details.socialMediaId) {
        logger.info("socialMediaId not found", { archiveId: this.archiveId });
      }
      if (!details.publicationDate) {
        logger.info("publicationDate not found", { archiveId: this.archiveId });
      }
    }
    logger.info("recording details: ", details);
    this.abortController = new AbortController();
    return await res.blob().then(async (res) => {
      if (this.canceled) return;
      const result = await uploadFileToS3(res, this.waczS3Path, internalOnly, this.abortController.signal);
      if (result.errors) {
        this.postMessage({
          type: "upload",
          uploadStatus: "failed",
        });
        this.uploadStatus = false;
        await reportS3Error(this.archiveId);
        if (!result.errors?.length) return;
        const logtailLink = `https://logtail.com/team/${process.env.LOGTAIL_TEAM_ID}/tail?v=66947&q=traceid%3D"${result.errors[0]?.traceId}"`;
        //TODO Try again V2
        this.sendNotification("Upload failed" + new Date().toLocaleString(), "logo.png", "Upload failed", "Click for details", () =>
          chrome.tabs.create({ url: logtailLink, active: true })
        );
      } else {
        this.adminLink = `${process.env.ADMIN_URL}/archives/${this.archiveId}`;
        this.postMessage({
          type: "upload",
          uploadStatus: (this.uploadStatus = false),
          adminLink: this.adminLink,
        });
        this.openAdminLink(this.adminLink);
        await this.updateRecord(
          res.size,
          details?.waczContent,
          details?.publicationDate,
          details?.socialMediaId,
          details?.socialMediaUserName,
          details?.platform,
          details?.pageTitle
        );
        await collLoader.deleteColl(this.collId);
        chrome.tabs.sendMessage(this.tabId, {
          type: "FinishTestRecord",
          details: { archiveId: this.archiveId, waczS3Path: this.waczS3Path, platform: details.platform },
        });
      }
    });
  }

  sendNotification(notificationId, iconUrl, title, message, callback) {
    chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl,
      title,
      message,
      priority: 2,
    });

    chrome.notifications.onClicked.addListener(callback);
  }

  getInjectScript() {
    return (
      behaviors +
      `;
    self.__bx_behaviors.init(${this.behaviorInitStr});`
    );
  }

  async handleScreenShot() {
    if (this.isScreenshot) {
      const key = `${this.tabId}`;
      const fullPageKey = `${this.tabId}_fullPage`;
      const [result, fullPageResult] = await Promise.all([
        new Promise((resolve) => chrome.storage.local.get(key, resolve)),
        new Promise((resolve) => chrome.storage.local.get(fullPageKey, resolve)),
      ]);

      const s3Path = await generateS3Path(IMG_TYPE);
      const fullPageS3Path = await generateS3Path(IMG_TYPE, "_fullPage");
      const file = result[key];
      const fullPageFile = fullPageResult[fullPageKey];

      this.clearScreenshotStorage();
      this.clearScreenshotStorage(fullPageKey);

      const resInfo = initialScreenCaptureInfo(this.archiveId, s3Path, `"${file}"`, fullPageS3Path, `"${fullPageFile}"`);

      if (resInfo.errors) {
        first_port.postMessage({ type: "connection-error", status: "connection", details: "Upload screenshot failed, please contact support" });
        logger.error("Error uploading screenshot", resInfo.errors);
      }
    }
  }

  async stopRecorder() {
    this.canceled = false;
    this.waczS3Path = await generateS3Path();
    await this.saveRecord();
    if (this.archiveId) {
      this.handleScreenShot();
      await this.detach();
      this.doUpdateStatus();
      this.uploadToS3();
    } else {
      await this.detach();
      this.doUpdateStatus();
    }
  }

  async cancelRecorder() {
    await this.detach();
    this.clearScreenshotStorage();
    collLoader.deleteColl(this.collId);
  }

  async cancelUploading() {
    this.canceled = true;
    this.abortController?.abort();
    this.postMessage({
      type: "upload",
      uploadStatus: (this.uploadStatus = false),
    });
    await cancelRecord(this.archiveId);
    this.clearScreenshotStorage();
    collLoader.deleteColl(this.collId);
  }

  clearScreenshotStorage(keyToRemove = `${this.tabId}`) {
    chrome.storage.local.remove([keyToRemove], function () {
      const error = chrome.runtime.lastError;
      if (error) {
        logger.error("Error in clear screenshot storage", error);
      }
    });
  }

  doUpdateStatus() {
    let title, color, text;
    const tabId = this.tabId;

    if (this.running) {
      if (this.behaviorState === BEHAVIOR_RUNNING) {
        title = "Recording: Autopilot Running!";
        color = "#3298dc";
        text = " ";
      } else if (this.numPending === 0) {
        title = "Recording: No URLs pending, can continue";
        color = "#64e986";
        text = " ";
      } else {
        title = `Recording: ${this.numPending} URLs pending, please wait`;
        color = "#bb9f08";
        text = "" + this.numPending;
      }
    } else if (this.failureMsg) {
      title = "Error: Can't Record this page";
      text = "X";
      color = "#F00";
    } else {
      title = "Not Recording";
      text = "";
      color = "#64e986";
    }

    chrome.action.setTitle({ title, tabId });
    chrome.action.setBadgeBackgroundColor({ color, tabId });
    chrome.action.setBadgeText({ text, tabId });

    if (this.port) {
      const status = this.getStatusMsg();
      this.port.postMessage(status);
    }
  }
  async timeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async start() {
    first_port.postMessage({ type: "on-capture", status: true });
    let tabId = this.tabId;
    await chrome.debugger.sendCommand({ tabId: tabId }, "Page.enable", {});
    let metrics = await chrome.debugger.sendCommand({ tabId: tabId }, "Page.getLayoutMetrics", {});
    const { height, width } = metrics.contentSize;
    // Overwrite clip for full page at all times.
    let clip = { x: 0, y: 0, width, height, scale: 1 };

    await chrome.debugger.sendCommand({ tabId: tabId }, "Emulation.setDeviceMetricsOverride", {
      height: Math.ceil(height),
      width: Math.ceil(width),
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this.timeout(3000);
    let response = await chrome.debugger.sendCommand({ tabId: tabId }, "Page.captureScreenshot", {
      format: IMG_TYPE,
      quality: 60,
      captureBeyondViewport: false,
      clip,
    });
    await chrome.debugger.sendCommand({ tabId: tabId }, "Emulation.clearDeviceMetricsOverride", {});
    const base64Data = "data:image/png;base64," + response.data;
    console.log("capture success");
    const key = `${tabId}_fullPage`;
    const obj = {};
    obj[key] = base64Data;
    chrome.storage.local.set(obj);
    first_port.postMessage({ type: "on-capture", status: false });
    return await super.start();
  }
}

// ===========================================================================

function main() {
  chrome.action.setBadgeBackgroundColor({ color: "#64e986" });
}

const validateToken = async (token) => {
  const res = await tokenValidation(token);
  if (res.errors) {
    if (res.errors?.[0]?.isException) {
      first_port.postMessage({ type: "login-error", status: "connection", details: res.errors });
    }
    return false;
  }
  return res.data.user;
};

const authentication = async () => {
  let valid = false;
  let jwt;

  await getJWTCookie().then((res) => {
    jwt = res;
  });
  if (jwt) {
    let email;
    let user_id;
    let roles;
    await validateToken(jwt).then((res) => {
      email = res.email;
      user_id = res._id;
      roles = res.roles;
    });
    if (email) {
      chrome.storage.local.set({ email: email });
      chrome.storage.local.set({ user_id: user_id });
      const rolesLength = roles?.length;
      noRole = !rolesLength;
      internalOnly = roles.includes("INTERNAL_RESEARCHER");
      if (internalOnly && rolesLength > 1) {
        logger.warn("INTERNAL RESEARCHER has more roles");
      }
      valid = true;
      first_port.postMessage({ type: "userDetails", email: email });
    }
    if (noRole) first_port.postMessage({ type: "noRole" });
  }

  return valid;
};

chrome.runtime.onConnect.addListener(async (port) => {
  first_port = port;
  switch (port.name) {
    case "popup-port":
      popupHandler(port);
      if (inLogin) return;
      port.postMessage({ type: "loggedIn", status: await authentication() });
      break;
  }
});

const onLogin = async (username, password) => {
  inLogin = true;
  const res = await login(username, password);
  if (res.errors) {
    console.log("res.errors", res.errors[0].message);
    first_port.postMessage({
      type: "login-error",
      status: res.errors[0].isException ? "connection" : "details",
      details: res.errors,
      value: res.errors[0].message,
    });
  } else if (res.data?.login?.token) {
    chrome.cookies.set({ url: process.env.ADMIN_URL, name: "jwt", value: res.data?.login?.token });
    chrome.storage.local.set({ user_id: res.data.login.user?._id });
    chrome.storage.local.set({ email: res.data.login.user?.email });
    noRole = !res.data.login.user?.roles.length;
    if (noRole) first_port.postMessage({ type: "noRole" });
    first_port.postMessage({ type: "loggedIn", status: true });
  } else {
    first_port.postMessage({
      type: "login-error",
      status: "admin-details",
      value: "Users with admin role must authenticate via the",
    });
  }
  inLogin = false;
};

function popupHandler(port) {
  if (!port.sender || port.sender.url !== chrome.runtime.getURL("popup.html")) {
    return;
  }

  let tabId = null;
  let recorder = null;
  port.onMessage.addListener(async (message) => {
    switch (message.type) {
      case "startUpdates":
        tabId = message.tabId;
        recorder = self.recorders[tabId];
        if (recorder) {
          recorder.port = port;
          recorder.doUpdateStatus();
          if (recorder.pendingMessages !== undefined) {
            recorder.pendingMessages.forEach((msg) => recorder.postMessage(msg));
            recorder.pendingMessages = [];
          }
        }
        port.postMessage(await listAllMsg(collLoader));
        break;

      case "startRecording": {
        const { collId, autorun } = message;
        startRecorder(tabId, { collId, port, autorun }, message.url);
        break;
      }
      case "stopRecording":
        stopRecorder(tabId);
        break;

      case "cancelRecording":
        cancelRecorder(tabId, port);
        break;
      case "cancelUploading":
        cancelUploading(tabId);
        break;
      case "screenshot":
        if (self.recorders[tabId]) {
          self.recorders[tabId].isScreenshot = message.status;
        } else screenshotBeforeRecord = message.status;

        break;
      case "toggleBehaviors":
        toggleBehaviors(tabId);
        break;
      case "login":
        onLogin(message.username, message.password, message.port);
        break;

      case "newColl": {
        const { autorun } = message;
        const { name } = await collLoader.initNewColl({ title: message.title });
        defaultCollId = name;
        port.postMessage(await listAllMsg(collLoader, { defaultCollId }));
        await setLocalOption("defaultCollId", defaultCollId);
        startRecorder(tabId, { collId: defaultCollId, port, autorun }, message.url);
        break;
      }
      case "uploadAgain": {
        self.recorders[tabId] && self.recorders[tabId].uploadToS3();
        break;
      }
    }
  });

  port.onDisconnect.addListener(() => {
    if (self.recorders[tabId]) {
      self.recorders[tabId].port = null;
    }
  });
}

// ===========================================================================
chrome.debugger.onDetach.addListener((tab, reason) => {
  // target closed, delete recorder as this tab will not be used again
  if (reason === "target_closed") {
    delete self.recorders[tab.id];
  }
});

// ===========================================================================
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  let openUrl = null;
  let start = false;
  let waitForTabUpdate = true;
  let collId = null;

  // start recording from extension in new tab use case
  if (newRecUrl && tab.pendingUrl === "about:blank") {
    start = true;
    openUrl = newRecUrl;
    collId = newRecCollId || defaultCollId;
    newRecUrl = null;
    newRecCollId = null;
  } else if (tab.openerTabId && (!tab.pendingUrl || isValidUrl(tab.pendingUrl)) && self.recorders[tab.openerTabId] && self.recorders[tab.openerTabId].running) {
    collId = self.recorders[tab.openerTabId].collId;

    start = true;
    if (tab.pendingUrl) {
      waitForTabUpdate = false;
      openUrl = tab.pendingUrl;
    }
  }

  if (start) {
    if (openUrl && !isValidUrl(openUrl)) {
      return;
    }
    startRecorder(tab.id, { waitForTabUpdate, collId, openUrl, autorun }, openUrl);
  }
});

// ===========================================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId && self.recorders[tabId]) {
    const recorder = self.recorders[tabId];
    if (changeInfo.url) {
      recorder.failureMsg = null;
    }

    if (changeInfo.url && openWinMap.has(changeInfo.url)) {
      openWinMap.delete(changeInfo.url);
    }

    if (recorder.waitForTabUpdate) {
      if (isValidUrl(changeInfo.url)) {
        recorder.attach();
      } else {
        recorder.waitForTabUpdate = false;
        delete self.recorders[tabId];
      }
    }
  } else if (changeInfo.url && openWinMap.has(changeInfo.url)) {
    const collId = openWinMap.get(changeInfo.url);
    openWinMap.delete(changeInfo.url);
    if (!tabId || !isValidUrl(changeInfo.url)) {
      return;
    }
    startRecorder(tabId, { collId, autorun }, changeInfo.url);
  }
});

// ===========================================================================
chrome.tabs.onRemoved.addListener((tabId) => {
  delete self.recorders[tabId];
  removeLocalOption(`${tabId}-collId`);
});

// ===========================================================================
async function startRecorder(tabId, opts) {
  // first_port.postMessage({ type: "on-capture", status:false});
  if (!self.recorders[tabId]) {
    opts.collLoader = collLoader;
    opts.openWinMap = openWinMap;
    self.recorders[tabId] = new CustomBrowserRecorder({ tabId }, opts);
  } else {
    const recorder = self.recorders[tabId];
    recorder.setAutoRunBehavior(opts.autorun);
    recorder.postMessage({
      type: "upload",
      uploadStatus: (recorder.uploadStatus = false),
      adminLink: (recorder.adminLink = ""),
    });
  }

  let err = null;

  const { waitForTabUpdate } = opts;

  if (!waitForTabUpdate && !self.recorders[tabId].running) {
    try {
      self.recorders[tabId].setCollId(opts.collId);
      await self.recorders[tabId].attach();
    } catch (e) {
      console.warn("Error in attach", e); //TODO Check Error Type
      err = e;
    }
    return err;
  }
}

// ===========================================================================
function stopRecorder(tabId) {
  if (self.recorders[tabId]) {
    self.recorders[tabId].stopRecorder();
  }
}

function cancelRecorder(tabId) {
  if (self.recorders[tabId]) {
    self.recorders[tabId].cancelRecorder();
  }
}

function cancelUploading(tabId) {
  if (self.recorders[tabId]) {
    self.recorders[tabId].cancelUploading();
  }
}

// ===========================================================================
function toggleBehaviors(tabId) {
  if (self.recorders[tabId]) {
    self.recorders[tabId].toggleBehaviors();
    return true;
  }

  return false;
}

// ===========================================================================
function isRecording(tabId) {
  return self.recorders[tabId] && self.recorders[tabId].running;
}

// ===========================================================================
function isValidUrl(url) {
  return url && (url === "about:blank" || url.startsWith("https:") || url.startsWith("http:"));
}

// ===========================================================================
self.addEventListener("message", async (event) => {
  const message = event.data;

  switch (message.msg) {
    case "startNew":
      newRecUrl = message.url;
      newRecCollId = message.collId;
      autorun = message.autorun;
      defaultCollId = await getLocalOption("defaultCollId");
      // Instead of using chrome.tabs.create, communicate with other parts of the extension
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "OpenNewTab",
            url: "about:blank",
          });
        });
      });
      break;

    case "disableCSP":
      disableCSPForTab(message.tabId);
      break;
  }
});

// ===========================================================================
async function disableCSPForTab(tabId) {
  if (disabledCSPTabs.has(tabId)) {
    return;
  }

  await new Promise((resolve) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      resolve();
    });
  });

  await new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId }, "Page.setBypassCSP", { enabled: true }, (resp) => resolve(resp));
  });

  disabledCSPTabs.add(tabId);

  // hacky: don't detach if any recorders are running, otherwise will disconnect
  for (const rec of Object.values(self.recorders)) {
    if (rec.running) {
      return;
    }
  }

  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      resolve();
    });
  });
}

// ===========================================================================
// Set up the service worker to handle the onInstalled event
chrome.runtime.onInstalled.addListener((details) => {
  // Check the reason for the onInstalled event
  if (details.reason === "install" || details.reason === "update") {
    main();
  }
});
