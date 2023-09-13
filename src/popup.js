import { LitElement, html, css, unsafeCSS } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import bulma from "bulma/bulma.sass";
import closeIcon from "../assets/close.svg";
import logoutIcon from "../assets/outIcon.svg";
import { BEHAVIOR_WAIT_LOAD } from "@webrecorder/archivewebpage/src/consts";
import prettyBytes from "pretty-bytes";
import { getLocalOption, removeLocalOption, setLocalOption } from "@webrecorder/archivewebpage/src/localstorage";

import { logger } from "./services/logger";

const allCss = unsafeCSS(bulma);
function wrapCss(custom) {
  return [allCss, custom];
}
// ===========================================================================
class RecPopup extends LitElement {
  constructor() {
    super();
    this.collections = [];
    this.collTitle = "";
    this.collId = "";
    this.tabId = 0;
    this.recording = false;
    this.status = null;
    this.port = null;
    this.pageUrl = "";
    this.pageTs = 0;
    this.replayUrl = "";
    this.canRecord = false;
    this.failureMsg = null;
    this.collDrop = "";
    this.screenshot = true;
    this.uploadStatus = false;
    this.waitingForStart = false;
    this.waitingForStop = false;
    this.behaviorState = BEHAVIOR_WAIT_LOAD;
    this.behaviorMsg = "";
    this.autorun = false;
    this.adminLink = "";
    this.username = "";
    this.password = "";
    this.error = false;
    this.adminDetailsError = false;
    this.errorMessage = "";
    this.loader = true;
    this.loginLoader = false;
    this.connectionError = false;
    this.connectionErrorDetails = false;
    this.tryAgain = false;
    this.noRole = false;
  }
  static get properties() {
    return {
      collections: { type: Array },
      collId: { type: String },
      collTitle: { type: String },
      collDrop: { type: String },
      recording: { type: Boolean },
      status: { type: Object },
      waitingForStart: { type: Boolean },
      replayUrl: { type: String },
      pageUrl: { type: String },
      pageTs: { type: Number },
      canRecord: { type: Boolean },
      failureMsg: { type: String },
      behaviorState: { type: String },
      behaviorResults: { type: Object },
      behaviorMsg: { type: String },
      autorun: { type: Boolean },
      screenshot: { type: Boolean },
      uploadStatus: { type: Boolean },
      adminLink: { type: String },
      isLoggedIn: { type: Boolean },
      username: { type: String },
      password: { type: String },
      error: { type: Boolean },
      errorMessage: { type: String },
      loader: { type: Boolean },
      connectionError: { type: Boolean },
      connectionErrorDetails: { type: String },
      tryAgain: { type: Boolean },
      noRole: { type: Boolean },
    };
  }
  async firstUpdated() {
    document.addEventListener("click", () => {
      if (this.collDrop === "show") {
        this.collDrop = "";
      }
    });

    this.autorun = (await getLocalOption("autorunBehaviors")) === "1";

    this.registerMessages();
  }

  changeSize(reduce) {
    if (reduce) {
      document.getElementsByTagName('html')[0].style.width = "490px";
      document.getElementsByTagName('html')[0].style.height = "251px";
    }
    else {
      document.getElementsByTagName('html')[0].style.width = "600px";
      document.getElementsByTagName('html')[0].style.height = "490px";
    }
  }


  async onCapture() {
    let info = await chrome.runtime.getPlatformInfo();
    let winOs = info.os === 'win'
    const streamId = await new Promise((resolve) => {
      winOs && setTimeout(() => { this.changeSize(false); }, 100);
      chrome.desktopCapture.chooseDesktopMedia(["window"], (streamId) => {
        resolve(streamId);
      });
    });

    if (!streamId) {
      winOs && this.changeSize(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: streamId,
          },
        },
      });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();
      winOs && this.changeSize(true);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
      const dataUrlResized = canvas.toDataURL();
      const key = `${this.tabId}`;
      const obj = {};
      obj[key] = dataUrlResized;
      await new Promise((resolve) => {
        chrome.storage.local.set(obj, () => {
          resolve();
        });
      });
    } catch (err) {
      logger.error("capturingError", err);
    }
  }

  logout() {
    chrome.storage.local.clear();
    chrome.cookies.remove({ url: process.env.ADMIN_URL, name: "jwt" });
    this.isLoggedIn = false;
  }
  onClickCapture() {
    this.screenshot = !this.screenshot;
    this.sendMessage({ type: "screenshot", status: this.screenshot });
  }
  registerMessages() {
    this.port = chrome.runtime.connect({ name: "popup-port" });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length) {
        this.tabId = tabs[0].id;
        this.pageUrl = tabs[0].url;
        chrome.action.getTitle({ tabId: this.tabId }, (result) => {
          this.recording = result.indexOf("Recording:") >= 0;
        });

        this.sendMessage({ tabId: this.tabId, type: "startUpdates" });
      }
    });
    this.port.onMessage.addListener((message) => {
      this.onMessage(message);
    });
  }
  sendMessage(message) {
    this.port.postMessage(message);
  }

  async onMessage(message) {
    switch (message.type) {
      case "screenshot":
        this.screenshot = message.status;
        break;
      case "loggedIn":
        this.isLoggedIn = message.status;
        this.loginLoader = false;
        this.loader = false;
        break;
      case "noRole":
        this.noRole = true;
        this.canRecord = false;
        break;
      case "status":
        this.recording = message.recording;
        if (this.waitingForStart && message.firstPageStarted) {
          this.waitingForStart = false;
        }
        if (this.waitingForStop && !message.recording && !message.stopping) {
          this.waitingForStop = false;
        }
        this.status = message;
        this.behaviorState = message.behaviorState;
        this.behaviorMsg = (message.behaviorData && message.behaviorData.msg) || "Starting...";
        this.behaviorResults = message.behaviorData && message.behaviorData.state;
        this.autorun = message.autorun;
        if (message.pageUrl) {
          this.pageUrl = message.pageUrl;
        }
        if (message.pageTs) {
          this.pageTs = message.pageTs;
        }
        this.failureMsg = message.failureMsg;
        if (this.collId !== message.collId) {
          this.collId = message.collId;
          this.collTitle = this.findTitleFor(this.collId);
          await setLocalOption(`${this.tabId}-collId`, this.collId);
        }
        this.uploadStatus = message.uploadStatus;
        this.adminLink = message.adminLink || "";
        this.screenshot = message.isScreenshot;
        break;
      case "collections":
        this.collections = message.collections;
        this.collId = await getLocalOption(`${this.tabId}-collId`);
        this.collTitle = "";
        if (this.collId) {
          this.collTitle = this.findTitleFor(this.collId);
        }
        // may no longer be valid, try default id
        if (!this.collTitle) {
          this.collId = message.collId;
          this.collTitle = this.findTitleFor(this.collId);
        }
        if (!this.collTitle) {
          this.collTitle = "[No Title]";
        }
        break;
      case "upload":
        if (message.uploadStatus === "failed") {
          this.uploadStatus = false;
          this.tryAgain = true;
        } else {
          this.uploadStatus = message.uploadStatus;
          this.adminLink = message.adminLink || "";
        }
        break;
      case "login-error":
        this.loginError(message);
        break;
      case "connection-error":
        this.loginError(message);
        break;
      case "userDetails":
        this.username = message.email;
        break;
    }
  }

  loginError = (message) => {
    this.loginLoader = false;
    if (message.status == "details") {
      this.error = true;
    } else if (message.status == "admin-details") {
      this.adminDetailsError = true;
    } else if (message.status == "connection") {
      this.connectionError = true;
      this.connectionErrorDetails = JSON.stringify(message.details);
    }
    this.errorMessage = message.value;
  };
  findTitleFor(match) {
    if (!match) {
      return "";
    }
    for (const coll of this.collections) {
      if (coll.id === this.collId) {
        return coll.title;
      }
    }
    return "";
  }
  updated(changedProperties) {
    if (
      this.pageUrl &&
      this.pageTs &&
      (changedProperties.has("pageUrl") || changedProperties.has("pageTs") || changedProperties.has("recording") || changedProperties.has("collId"))
    ) {
      const params = new URLSearchParams();
      params.set("url", this.pageUrl);
      params.set("ts", new Date(this.pageTs).toISOString().replace(/[-:TZ.]/g, ""));
      params.set("view", "pages");
      this.replayUrl = this.getCollPage() + "#" + params.toString();
    }
    if (changedProperties.has("pageUrl") || changedProperties.has("failureMsg")) {
      this.canRecord = this.pageUrl && (this.pageUrl === "about:blank" || this.pageUrl.startsWith("http:") || this.pageUrl.startsWith("https:"));
    }
  }
  login() {
    this.loginLoader = true;
    this.loader = false;
    this.error = false;
    this.adminDetailsError = false;
    this.sendMessage({
      type: "login",
      status: true,
      username: this.username,
      password: this.password,
      port: this.port,
    });
  }

  getHomePage() {
    return chrome.runtime.getURL("replay/index.html");
  }
  get extRoot() {
    return chrome.runtime.getURL("");
  }
  getCollPage() {
    const sourceParams = new URLSearchParams();
    sourceParams.set("source", "local://" + this.collId);
    return this.getHomePage() + "?" + sourceParams.toString();
  }
  cancelRecording() {
    if (this.uploadStatus) {
      this.sendMessage({ type: "cancelUploading" });
    } else {
      this.sendMessage({ type: "cancelRecording" });
    }
    // chrome.storage.local.removeItem(`${this.tabId}-img`);
  }
  uploadAgain() {
    this.sendMessage({ type: "uploadAgain" });
    this.tryAgain = false;
  }
  get notRecordingMessage() {
    return "Not Recording this Tab";
  }
  static get styles() {
    return wrapCss(css`
      :host {
        width: 100%;
        height: 100%;
        display: flex;
        font-size: initial !important;
      }
      .centerItems {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .manage {
        font-weight: bold;
        font-size: medium;
        color: #40b4df;
      }
      .container {
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        height: 100%;
      }
      .container_checkbox {
        display: block;
        position: relative;
        padding-left: 35px;
        cursor: pointer;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        direction: ltr;
      }
      .container_checkbox input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        height: 0;
        width: 0;
      }
      .checkmark {
        position: absolute;
        top: 0;
        left: 0;
        height: 20px;
        width: 20px;
        border: 1px solid #21c0fc;
        border-radius: 4px;
        opacity: 1;
        background-color: #0000;
      }
      .container_checkbox input:checked ~ .checkmark {
        background-color: #2196f3;
      }
      .checkmark:after {
        content: "";
        position: absolute;
        display: none;
      }
      .container_checkbox input:checked ~ .checkmark:after {
        display: block;
      }
      .container_checkbox .checkmark:after {
        left: 5px;
        top: 3px;
        width: 5px;
        height: 10px;
        border: solid white;
        border-width: 0 3px 3px 0;
        -webkit-transform: rotate(45deg);
        -ms-transform: rotate(45deg);
        transform: rotate(45deg);
      }
      .checkbox_row {
        display: flex;
        flex: 1;
        font-size: 15px;
        padding: 3px 7px;
      }
      .screenshot_label {
        padding-right: 6px;
        padding-top: 5px;
      }

      .record {
        margin: auto;
        height: 100px;
        position: relative;
        display: flex;
        flex: 1;
      }
      .cancel {
        width: 24px;
        height: 24px;
        top: 0;
        right: 0;
        position: absolute;
        background: #323335;
        border-radius: 2em;
        cursor: pointer;
        display: flex;
        cursor: pointer;
      }
      .disable {
        pointer-events: none !important;
        opacity: 0.5;
      }

      .recShaddow {
        animation-name: pulse;
        animation-duration: 2.5s;
        animation-iteration-count: infinite;
        animation-timing-function: linear;
      }
      .small-loader {
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        display: flex;
        margin: auto;
        border: 2px solid gray;
        border-top: 2px solid white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        animation: spin 1s linear infinite;
      }
      .loader {
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        display: flex;
        margin: auto;
        position: absolute;
        border: 4px solid gray;
        border-top: 4px solid white;
        border-radius: 50%;
        width: 70px;
        height: 70px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
      @keyframes pulse {
        0% {
          box-shadow: 0px 0px 5px 0px rgba(255, 0, 12, 0.5);
        }
        65% {
          box-shadow: 0px 0px 5px 16px rgba(255, 0, 12, 0.3);
        }
        90% {
          box-shadow: 0px 0px 5px 16px rgba(255, 0, 12, 0);
        }
      }
      .linkWrapper {
        border-style: solid;
        border-color: #2596be;
        padding: 3px 7px;
        border-radius: 5px;
        width: fit-content;
        cursor: pointer;
      }

      .linkWrapper:hover div {
        color: black !important;
      }
      .linkWrapper:hover {
        background-color: #2596be;
      }

      .logo {
        display: flex;
        align-items: center;
        width: fit-content;
        cursor: pointer;
      }

      .userLine {
        display: flex;
        align-items: center;
        width: fit-content;
      }
      .startRecord {
        background-color: #ff0000;
      }
      .recordIcon {
        width: 70px;
        height: 70px;
        border: 2px white solid;
        margin: auto;
        cursor: pointer;
        border-radius: 50px;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .stop {
        width: 18px;
        height: 18px;
        background-color: #ff0000;
        border-radius: 2px;
      }
      .view-row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        font-size: 1.1em;
        margin: 0 10px;
      }

      .view-column {
        display: flex;
        flex-direction: column;
      }
      .lds-ellipsis {
        display: inline-block;
        position: relative;
        width: 44px;
        display: flex;
        align-items: center;
      }
      .lds-ellipsis div {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #fff;
        animation-timing-function: cubic-bezier(0, 1, 1, 0);
      }
      .lds-ellipsis div:nth-child(1) {
        left: 8px;
        animation: lds-ellipsis1 0.6s infinite;
      }
      .lds-ellipsis div:nth-child(2) {
        left: 8px;
        animation: lds-ellipsis2 0.6s infinite;
      }
      .lds-ellipsis div:nth-child(3) {
        left: 20px;
        animation: lds-ellipsis2 0.6s infinite;
      }
      .lds-ellipsis div:nth-child(4) {
        left: 32px;
        animation: lds-ellipsis3 0.6s infinite;
      }
      @keyframes lds-ellipsis1 {
        0% {
          transform: scale(0);
        }
        100% {
          transform: scale(1);
        }
      }
      @keyframes lds-ellipsis3 {
        0% {
          transform: scale(1);
        }
        100% {
          transform: scale(0);
        }
      }
      @keyframes lds-ellipsis2 {
        0% {
          transform: translate(0, 0);
        }
        100% {
          transform: translate(12px, 0);
        }
      }
      .recordedSize {
        margin: auto;
        min-width: 180px;
        width: fit-content;
        background: #471619;
        border-radius: 29px;
        font-size: 14px;
        color: #ff000c;
        padding: 6px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-around;
      }
      .red-dot {
        height: 10px;
        width: 10px;
        border-radius: 10px;
        background: #ff000c;
      }
      .uploading {
        display: flex;
        align-items: center;
        justify-content: end;
        align-items: baseline;
      }
      .login {
        display: flex;
        flex-direction: column;
        text-align: center;
        margin: auto;
        align-items: center;
        height: 150px;
        justify-content: space-between;
        padding: 50px 0 20px;
        width: 43%;
      }

      .userinput {
        min-height: 35px;
        padding: 3px 7px;
        width: 240px;
        background: #ffffff;
        width: 100%;
        border: 0;
        margin: 0 0 15px;
        box-sizing: border-box;
        border-radius: 5px;
      }

      .loginButton {
        width: 80px;
        border-radius: 5px;
        min-height: 35px;
        box-sizing: border-box;
        margin: auto;
        background: black;
        color: white;
        text-align: center;
      }
      .adminAppLink {
        font-size: 14px;
        cursor: pointer;
        color: #40b4df;
        margin-bottom: 10px;
      }

      .link {
        color: #ffffff;
        font-size: 12px;
        cursor: pointer;
        padding-bottom: 10px;
      }
      a:hover {
        color: #2596be !important;
      }

      .link:hover {
        color: #2596be !important;
      }

      .tryAgain {
        display: flex;
        flex-direction: column;
        flex: 1;
        align-items: flex-end;
      }

      .tryAgain .error-message {
        color: red;
        text-align: right;
        margin-bottom: 7px;
      }

      .userinput[name="email"] {
        z-index: 200;
      }

      .canNotRecord {
        padding: 0 20px;
      }
    `);
  }
  renderRecorderButton() {
    return html`
<div class="record">
   <div
   class="${(this.status?.stopping && this.recording) || this.uploadStatus ? "disable" : ""} ${!this.recording ? "startRecord recordIcon" : "recShaddow recordIcon"
      } "
   @click="${!this.recording ? this.onStart : this.onStop}"
   >
   <div class="stop" /></div>  
</div>
${this.recording || this.uploadStatus
        ? html`
        <div>
          <div class="cancel">
            <wr-icon
              @click="${this.cancelRecording}"
              style="fill: white;display: flex;align-items: center; margin: auto;"
              size="12px"
              .src="${closeIcon}"
            ></wr-icon>
          </div>
        </div>
      `
        : ""
      }
${this.status?.stopping && this.recording ? html` <div class="loader"></div>` : ""}</div>
`;
  }
  renderLogin() {
    return html`<div class="login">
      <div style="left: 13px;top: 20px;position:absolute;cursor:pointer" @click="${() => this.openAdminLink(process.env.ADMIN_URL)}">
        <img src="logo.png" width="40px" height="40px" />
      </div>

      <input
        name="email"
        type="text"
        placeholder="username"
        class="userinput"
        style="z-index: 200"
        @change="${(e) => {
        this.username = e.target.value;
      }}"
        @keydown="${(e) => {
        if (e.keyCode === 13) {
          this.username = e.target.value;
          this.login();
        }
      }}"
      />
      <input
        class="userinput"
        type="password"
        placeholder="password"
        @change="${(e) => {
        this.password = e.target.value;
      }}"
        @keydown="${(e) => {
        if (e.keyCode === 13) {
          this.password = e.target.value;
          this.login();
        }
      }}"
      />
      ${this.adminDetailsError
        ? html`<p style="color:red;padding-bottom:10px">${this.errorMessage}</p>
            <div class="adminAppLink" @click="${() => this.openAdminLink(`${process.env.ADMIN_URL}/login`)}">Admin Web application</div>`
        : this.error
          ? html`<p style="color:red;padding-bottom:10px">${this.errorMessage}</p>`
          : ""}
      <button @click="${() => this.login()}" class="linkWrapper loginButton" title="test">
        ${this.loginLoader ? html` <div class="small-loader" /> ` : "LOGIN"}
      </button>
      <div class="link" @click="${() => this.openAdminLink(`${process.env.ADMIN_URL}/forgotPassword`)}">Forgot password?</div>
    </div>`;
  }
  render() {
    if (this.connectionError) return html` <p class="container" style="color:red">Internal Error please contact support - ${this.connectionErrorDetails}</p>`;
    else
      try {
        return html` ${this.loader
          ? html`<div class="container"><p class="loader"></p></div>`
          : this.isLoggedIn
            ? html`
<div class="container">
   <div class="view-row">
         <div @click="${() => this.openAdminLink(process.env.ADMIN_URL)}" class="logo">
         <img src="logo.png" width="40px" height="40px"/> 
      </div>
      <div class="userLine"  >
        <p style="margin-left: 4px;">${this.username}&nbsp </p>
          <div>
            <wr-icon
            @click="${this.logout}"
            style="fill: white;display: flex;align-items: center; margin: auto;cursor:pointer"
            size="16px"
            .src="${logoutIcon}"
           >
           </wr-icon>
        </div>
      </div>
   </div>
   ${this.canRecord
                ? html`
           <div class="view-row">
             <div style="flex:1"></div>
             ${this.renderRecorderButton()}
              <div class="tryAgain">
               ${this.tryAgain
                    ? html`
                     <p class="error-message"">Upload failed</p>
                     <div class="linkWrapper">
                      <div @click="${() => this.uploadAgain()}" class="manage">Try again</a>          
                   `
                    : ""
                  }
               ${this.uploadStatus
                    ? html`
                       <div class="uploading">
                         uploading
                         <div class="lds-ellipsis">
                           <div></div>
                           <div></div>
                           <div></div>
                           <div></div>
                         </div>
                       </div>
                     `
                    : ""
                  }
            </div>

             </div>
           </div>
         `
                : this.noRole
                  ? html`<div class="canNotRecord">You've not been assigned to any role to record contents, please contact the admin</div>`
                  : html`<div class="canNotRecord">This page could not be recorded!</div>`
              }
${this.status && this.recording
                ? html`<div class="view-row">
        <div class="recordedSize">
          <div class="red-dot"></div>
          RECORDING - &nbsp ${prettyBytes(this.status.sizeNew)}
        </div>
      </div>`
                : ""
              }
   <div class="view-row" style="align-items: end !important">
      <div > 
      ${this.canRecord
                ? html`
                <div class="checkbox_row">
                  <div class="${this.recording && "disable"}">
                    <label class="container_checkbox">
                      ${this.screenshot
                    ? html`<input
                              type="checkbox"
                              checked
                              @change="${() => {
                        this.onClickCapture();
                      }}"
                            />`
                    : html` <input
                              type="checkbox"
                              @change="${() => {
                        this.onClickCapture();
                      }}"
                            />`
                  }
                      <span class="checkmark"></span>
                    </label>
                  </div>
                  <p id="text_" style="display:none">Checkbox is CHECKED!</p>
                  <div class="screenshot_label">Screen Capture</div>
                </div>
               </div>
            `
                : ""
              }
      </div>
      ${this.canRecord
                ? html`<div>
         <div class=${this.adminLink.length ? "linkWrapper" : "disable"}>
            <div @click="${() => this.openAdminLink(this.adminLink)}" class="manage">MANAGE ARCHIVE</a>
         </div>
      </div>`
                : ""
              }
   </div>
</div>
</div>
</div>`
            : this.renderLogin()}`;
      } catch (error) {
        logger.error("renderingError", error);
        chrome.runtime.reload();
      }
  }
  async onStart() {
    this.tryAgain = false;
    if (this.screenshot) await this.onCapture();
    await removeLocalOption(`${this.tabId}-collId`);
    this.sendMessage({
      type: "newColl",
      tabId: this.tabId,
      title: this.pageUrl,
      url: this.pageUrl,
      autorun: this.autorun,
    });
    this.waitingForStart = true;
    this.waitingForStop = false;
  }

  onStop() {
    this.sendMessage({ type: "stopRecording" });
    this.waitingForStart = false;
    this.waitingForStop = true;
    const params = new URLSearchParams();
    params.set("url", this.pageUrl);
    params.set("ts", new Date(this.pageTs).toISOString().replace(/[-:TZ.]/g, ""));
    params.set("view", "pages");
    params.set("currentPageId", chrome.storage.local.get("currentPageId"));
    this.replayUrl = this.getCollPage() + "#" + params.toString();
  }

  openAdminLink(link) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTab = tabs[0];
      chrome.tabs.query({ url: `${process.env.ADMIN_URL}/*` }, function (tabs) {
        const index = activeTab.index + 1;
        if (tabs.length > 0) {
          const exitingTab = tabs.find((tab) => tab.url === link);
          if (exitingTab) chrome.tabs.update(exitingTab.id, { url: link, active: true });
          else {
            const matchingTab = tabs.find((tab) => !tab.url.includes(`${process.env.ADMIN_URL}/archives/`));
            if (matchingTab) chrome.tabs.update(matchingTab.id, { url: link, active: true });
            else chrome.tabs.create({ url: link, index: index, active: true });
          }
        } else chrome.tabs.create({ url: link, index: index, active: true });
      });
    });
  }
}
// ===========================================================================
class WrIcon extends LitElement {
  constructor() {
    super();
    this.size = "0.9em";
  }
  static get properties() {
    return {
      src: { type: Object },
      size: { type: String },
    };
  }
  render() {
    return html`
      <svg style="width: ${this.size}; height: ${this.size}">
        <g>${unsafeSVG(this.src)}</g>
      </svg>
    `;
  }
}
customElements.define("wr-icon", WrIcon);
customElements.define("wr-popup-viewer", RecPopup);
export { RecPopup };
