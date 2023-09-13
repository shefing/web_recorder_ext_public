import BaseWARCHandler from "../BaseWARCHandler";

export class Twitterhandler extends BaseWARCHandler {
  async analyzePage(downloader) {
    //Preparing and finding the resource to Scan
    let mainResource = await this.getMainResource(downloader);
    let decodeString = this.decoder.decode(mainResource.payload);
    this.screenName = decodeString.match(/"screen_name":"([^"]+)"/)?.[1];
    this.name = decodeString.match(/"name":"([^"]+)"/)?.[1];
    this.userId = decodeString.match(/"user_id":"([^"]+)"/)?.[1];
    this.profile_pic = decodeString.match(/"profile_image_url_https":"[^"]*\/(\d+)/)?.[1];
    console.log("screenName", this.screenName, "name", this.name, "profile_pic", this.profile_pic, "userId", this.userId);
    let postData = downloader.firstResources.filter((resource) => {
      return resource.url.includes("graphql") && resource.url.includes("TweetDetail");
    })[0];
    if (!postData?.payload) {
      postData.payload = await downloader.db.loadPayload(postData);
    }
    let decodedPayload = postData?.payload ? this.decoder.decode(postData.payload) : "";
    let parsePayload = decodedPayload ? JSON.parse(decodedPayload) : "";
    const data = parsePayload?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries?.[0]?.content?.itemContent?.tweet_results?.result;
    this.publicationDate = data?.legacy?.created_at;
    this.socialMediaUserName = data?.core?.user_results?.result?.legacy?.screen_name;
    this.socialMediaId = data?.legacy?.user_id_str;
  }
  getDetails() {
    return { socialMediaId: this.socialMediaId, publicationDate: this.publicationDate, 
              socialMediaUserName: this.socialMediaUserName, platform: "Twitter" };
  }

  isLoggedIn() {
    return !!this.name;
  }
}
