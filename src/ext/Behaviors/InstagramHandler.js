import BaseWARCHandler from "../BaseWARCHandler";

export class InstagramHandler extends BaseWARCHandler {
  async analyzePage(downloader) {
    let mainResource = await this.getMainResource(downloader);
    let decodeString = this.decoder.decode(mainResource.payload);
    this.userName = decodeString.match(/"username\\":\\"([^"]+)"/)?.[1].slice(0, -1);
    this.viewerId = decodeString.match(/"viewerId\\":\\"([^"]+)"/)?.[1].slice(0, -1);
    this.full_name = decodeString.match(/"full_name\\":\\"([^"]+)"/)?.[1].slice(0, -1);
    let takenAt = decodeString.match(/"taken_at":(\d+)/)?.[1];
    if (takenAt) this.publicationDate = new Date(Number(takenAt + "000"));

    this.profile_pic = decodeString
      .match(/"profile_pic_url_hd\\":\\"([^"]+)"/)?.[1]
      .slice(0, -1)
      .match(/\/([^\/?#]+)[^\/]*$/)[1];
    this.profileReg = new RegExp(`${this.profile_pic}`, "g");
    this.viewerIdReg = new RegExp(`${this.viewerId}`, "g");
    let mainUrl=downloader.recorder.pageInfo.url;
    if (mainUrl.includes("/reels/")){
      let socialMatches=decodeString.match(/"pk":"(\d+)","username":"([^"]+).*?"taken_at":(\d+)/);
      this.socialMediaId = socialMatches[1];
      this.socialMediaUserName = socialMatches[2];
      this.publicationDate = new Date(Number(socialMatches[3] + "000"));
    }else if (mainUrl.includes("/reel/") || true){ // Reel or regualr post
      let socialMatches=decodeString.match(/"pk":"(\d+)","username":"([^"]+).*?/);
      if (socialMatches) {
        this.socialMediaId = socialMatches[1];
        this.socialMediaUserName = socialMatches[2];
      }
      let takenAtMatch=decodeString.match(/"taken_at":(\d+)/);
      if (takenAtMatch)
        this.publicationDate = new Date(Number(takenAtMatch[1] + "000"));
    }
    console.log("socialMedia id", this.socialMediaId, "socialMedia username", this.socialMediaUserName, "publicationDate", this.publicationDate);
  }

  getDetails() {
    return { socialMediaId: this.socialMediaId, publicationDate: this.publicationDate, socialMediaUserName: this.socialMediaUserName, platform: "Instagram" };
  }

  isLoggedIn() {
    return !!this.userName;
  }
}
