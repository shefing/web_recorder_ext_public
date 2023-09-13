import BaseWARCHandler from "../BaseWARCHandler";

export class LinkedInHandler extends BaseWARCHandler {
  extractUnixTimestamp(postId) {
    const asBinary = BigInt(postId).toString(2);
    const first41Chars = asBinary.slice(0, 41);
    return parseInt(first41Chars, 2);
  }

  getDate(url) {
    const regex = /([0-9]{19})/;
    const postId = regex.exec(url)?.pop();
    return postId ? this.extractUnixTimestamp?.(postId) : "";
  }

  async analyzePage(downloader) {
    let mainResource = await this.getMainResource(downloader);
    let decodeString = this.decoder
      .decode(mainResource?.payload)
      .replace(/&quot;/g, '"') // replace &quot; with "
      .replace(/&amp;/g, "&");

    this.firstName = decodeString.match(/"firstName":"([^"]*)"/)?.[1];
    this.lastName = decodeString.match(/"lastName":"([^"]*)"/)?.[1];
    this.publicIdentifier = decodeString.match(/"publicIdentifier":"(.*?)"/)?.[1];
    this.pic = decodeString.match(/"picture":\s*{\s*.*?"rootUrl":\s*"([^"]+)"/s)?.[1];
    this.occupation = decodeString.match(/"occupation":"([^"]*)"/)?.[1];
    this.plainId = decodeString.match(/"plainId":(\d+)/)?.[1];

    this.firstNameRegEx = new RegExp(`${this.firstName}`, "gi");
    this.lastNameRegEx = new RegExp(`${this.lastName}`, "gi");
    this.publicIdentifierRegEx = new RegExp(`${this.publicIdentifier}`, "gi");
    this.picRegEx = new RegExp(`${this.pic}`, "gi");
    this.occupationRegEx = new RegExp(`${this.occupation}`, "gi");
    this.plainIdRegEx = new RegExp(`${this.plainId}`, "gi");
    this.publicationDate = this.getDate(mainResource?.url);
    this.socialMediaUserName = mainResource?.url?.match(/posts\/([^_]+)/)?.[1];
    if (!this.publicationDate) this.socialMediaUserName = mainResource?.url?.match(/in\/([^_]+)/)?.[1];
  }
  getDetails() {
    return { socialMediaId: this.socialMediaId, publicationDate: this.publicationDate,
             socialMediaUserName: this.socialMediaUserName , platform: "LinkedIn"};
  }

  isLoggedIn() {
    return !!this.firstNameRegEx;
  }

  parseWaczTextContent ( text ){
    let start=text.indexOf("Skip to search");
    if (start != -1)
      return text.substring(start);
    return text;
  }
}
