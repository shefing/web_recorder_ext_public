import { FacebookHandler, InstagramHandler, LinkedInHandler, Twitterhandler } from "./Behaviors";
import { Downloader } from "@webrecorder/awp-sw";
import { logger } from "../services/logger";

export class CustomDownloader extends Downloader {
  setRecorder(recorder) {
    this.recorder = recorder;
  }
  async downloadWACZ(filename, sizeCallback) {
    this.firstResources = await this.loadResourcesBlock();
    this.handler = null;
    if (this.recorder.pageInfo.url.includes("facebook")) {
      this.handler = new FacebookHandler();
    } else if (this.recorder.pageInfo.url.includes("instagram")) {
      this.handler = new InstagramHandler();
    } else if (this.recorder.pageInfo.url.includes("twitter")) {
      this.handler = new Twitterhandler();
    } else if (this.recorder.pageInfo.url.includes("linkedin")) {
      this.handler = new LinkedInHandler();
    }
    if (this.handler) {
      try {
        await this.handler.analyzePage(this);
      } catch (error) {
        logger.error("analyze post error", error);
      }
    }
    this.handlerDetails = this.handler?.getDetails();
    try {
      if(!this.handlerDetails){
        this.handlerDetails = {};
      }
      this.handlerDetails.pageTitle = this.recorder.pageInfo.title;
      let pagetext=this.recorder.pageInfo.text;
      if (this.handler){
        pagetext= this.handler.parseWaczTextContent(pagetext);
      }
      this.handlerDetails.waczContent = pagetext;//this.extractWaczContent(pagetext);
    } catch (error) {
      logger.error("analyze post error", error);
    }

    if (this.handler && !this.handler.isLoggedIn()) this.handler = null;
    return super.downloadWACZ(filename, sizeCallback);
  }

  getRecordDetails() {
    return this.handlerDetails;
  }

  extractWaczContent(text){
    const limitBytes = 50 * 1024; // Convert kilobytes to bytes
    if (text.length <= limitBytes) {
      return text; // No need to cut if the string is already within the limit
    } else {
      let cutString = text.substring(0,limitBytes); // Cut the string based on the byte limit
      // Adjust the cut string to the last complete character
      cutString = cutString.substring(0, Math.max(cutString.lastIndexOf(' '), cutString.lastIndexOf('\n')));
      return cutString;
    }
  }

  async *generateWARC(filename, digestRecordAndCDX = true) {
    try {
      let offset = 0;
      if (filename) {
        const warcinfo = await this.createWARCInfo(filename);
        yield warcinfo;
        offset += warcinfo.length;
      }

      if (this.markers.WARC_GROUP) {
        yield this.markers.WARC_GROUP;
      }

      for await (const resource of this.iterResources(this.firstResources)) {
        resource.offset = offset;

        if (this.handler && resource.url != this.recorder.pageInfo.url 
            && this.handler.shouldSkipResource(resource)) {
          console.log("url to skip: " + resource.url);
          resource.skipped = true;
          continue;
        }

        if (!resource.payload) {
          resource.payload = await this.db.loadPayload(resource);
        }
          const records = await this.createWARCRecord(resource);
        if (!records) {
          resource.skipped = true;
          continue;
        }

        // response record
        const responseData = { length: 0 };
        yield* this.emitRecord(records[0], digestRecordAndCDX, responseData);
        offset += responseData.length;
        resource.length = responseData.length;
        if (digestRecordAndCDX && !resource.recordDigest) {
          //resource.recordDigest = this.recordDigest(records[0]);
          resource.recordDigest = responseData?.digest;
        }

        // request record, if any
        if (records.length > 1) {
          const requestData = { length: 0 };
          yield* this.emitRecord(records[1], false, requestData);
          offset += requestData.length;
        }

        if (digestRecordAndCDX) {
          this.cdxjLines.push(this.getCDXJ(resource, this.warcName));
        }

        if (this.markers.WARC_GROUP) {
          yield this.markers.WARC_GROUP;
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }
}
