import BaseWARCHandler from "../BaseWARCHandler";

export class FacebookHandler extends BaseWARCHandler {
  async analyzePage(downloader) {
    //Preparing and finding the resource to Scan
    let mainResource = await this.getMainResource(downloader);
    let decodeString = this.decoder.decode(mainResource.payload);
    this.userName = decodeString.match(/"NAME":"([^"]+)"/)?.[1];
    this.shortName = decodeString.match(/"SHORT_NAME":"([^"]+)"/)?.[1];
    this.profile_pic = decodeString.match(/"profile_picture":{"uri":"[^"]+\/([^\/?]+\.[^\/?]+)\?/)?.[1];
    if (!this.profile_pic) this.profile_pic = decodeString.match(/"profilePic":{"uri":"[^"]+\/([^\/?]+\.[^\/?]+)\?/)?.[1];
    this.userId = decodeString.match(/"USER_ID":"(\d+)"/)?.[1];
    this.publicationDate = new Date(Number(decodeString.match(/"creation_time":(\d+)/)?.[1] + "000"));
    this.socialMediaId = decodeString.match(/"owner":{"__typename":"\w+","id":"(\d+)"/)?.[1];
    if (!this.socialMediaId) this.socialMediaId = decodeString.match(/"owner":{"__isNode":"User","id":"(\d+)"/)?.[1];
    if (!this.socialMediaId) this.socialMediaId = decodeString.match(/"owning_profile_id"\s*:\s*"(\d+)"/)?.[1];
    this.socialMediaUserName = decodeString.match(/video_owner.*?url":"https:\\\/\\\/www.facebook.com\\\/(.*?)"/)?.[1];
    if (!this.socialMediaUserName) this.socialMediaUserName = decodeString.match(/story_bucket_owner.*?url":"https:\\\/\\\/www.facebook.com\\\/(.*?)"/)?.[1];
    if (!this.socialMediaUserName) this.socialMediaUserName = decodeString.match(/actors.*?url":"https:\\\/\\\/www.facebook.com\\\/(.*?)"/)?.[1];
    this.profileReg = new RegExp(`${this.profile_pic}`, "g");
    this.viewerIdReg = new RegExp(`${this.userId}`, "g");
    let mainUrl=downloader.recorder.pageInfo.url;
    if (mainUrl.includes("/reel/")){
      this.isReels = true;
    }
  }

  getDetails() {
    return { socialMediaId: this.socialMediaId, publicationDate: this.publicationDate, socialMediaUserName: this.socialMediaUserName, platform: "Facebook" };
  }
  isLoggedIn() {
    return !!this.userName;
  }
}
