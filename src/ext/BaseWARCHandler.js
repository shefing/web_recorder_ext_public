export default class BaseWARCHandler {
  constructor() {
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
  }
  getDetails() {
    return {};
  }
  async getMainResource(downloader) {
    let mainResource = downloader.firstResources
      .filter((resource) => {
        return resource.url === downloader.recorder.pageInfo.url;
      })
      .sort(function (a, b) {
        return a.ts - b.ts;
      })[0];

    if (!mainResource.payload) {
      mainResource.payload = await downloader.db.loadPayload(mainResource);
    }
    return mainResource;
  }

  async getResourceByName(downloader, name) {
    let resource = null;
    let resources = downloader.firstResources.filter((resource) => {
      return resource.url.includes(name);
    });
    if (resources.length) {
      resource = resources.sort(function (a, b) {
        return a.ts - b.ts;
      })[0];
    } else {
      return null;
    }
    if (!resource?.payload) {
      resource.payload = await downloader.db.loadPayload(resource);
    }
    return resource;
  }

  async getParsedResourceByName(downloader, name) {
    let resource = await this.getResourceByName(downloader, name);
    if (resource) {
      let decodedPayload = this.decoder.decode(resource.payload);
      return JSON.parse(decodedPayload);
    }
    return null;
  }

  async analyzePage(downloader) {
    throw new Error("Method not implemented.");
  }
  getContentType(resource) {
    let resType = resource.respHeaders["content-type"];
    if (typeof resType == "undefined") {
      resType = resource.respHeaders["Content-Type"];
    }
    return resType;
  }
  isLoggedIn() {
    return true;
  }
  parseWaczTextContent(text) {
    return text;
  }
}
