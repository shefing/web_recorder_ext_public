const PORT = process.env.ADMIN_URL + "/graphql";
import { logger } from "../services/logger";
import { v4 as uuid } from "uuid";

let token = null;
let userId = null;

export const getJWTCookie = async () => {
  const cookie = await new Promise((resolve) => {
    chrome.cookies.get({ url: process.env.ADMIN_URL, name: "jwt" }, resolve);
  });

  if (cookie) {
    return cookie.value;
  } else {
    return false;
  }
};

const refreshToken = async () => {
  await getJWTCookie().then((res) => {
    token = res;
  });
  userId = chrome.storage.local.get({"user_id":""});
};

export const createInitialData = async (url, ip, s3Link, internalOnly) => {
  const traceId = uuid();
  await refreshToken();
  const query = `
  mutation {
   createInitialsData(createArchiveInput: {
   pageUrl:${JSON.stringify(url)},
   researcherIp:${JSON.stringify(ip)},
   s3Link: ${JSON.stringify(s3Link)},
   internalOnly: ${internalOnly},
   }) {_id}}
  `;
  try {
    let response = await fetch(PORT, {
      method: "post",
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({
        query,
      }),
    });
    return await response.json();
  } catch (e) {
    return logger.error("createInitialData", e, { url, ip, traceId });
  }
};

export const updateS3Info = async (archiveId, size, waczContent, publicationDate, socialMediaId, socialMediaHandle, platform, pageTitle) => {
  const traceId = uuid();

  await refreshToken();

  let optionalFields = "";
  if (publicationDate) {
    optionalFields += `publicationDate: ${JSON.stringify(publicationDate)}, `;
  }
  if (socialMediaId) {
    optionalFields += `socialMediaId: ${JSON.stringify(socialMediaId)}, `;
  }
  if (socialMediaHandle) {
    optionalFields += `socialMediaHandle: ${JSON.stringify(socialMediaHandle)}, `;
  }
  if (platform) {
    const regex = new RegExp('"', "g");
    let platformTxt = `platform: ${JSON.stringify(platform)}, `.replace(regex, "");
    optionalFields += platformTxt;
  }
  if (pageTitle) {
    optionalFields += `pageTitle: ${JSON.stringify(pageTitle)}, `;
  }

  const query = `
   mutation {
   updateS3Info(s3Info: {
   archiveId: ${JSON.stringify(archiveId)},
   webDataSize: ${JSON.stringify(size)},
   waczContent: ${JSON.stringify(waczContent)},
   ${optionalFields}
    }) {targetName}}
  `;
  try {
    let response = await fetch(PORT, {
      method: "post",
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({
        query,
      }),
    });
    return await response.json();
  } catch (e) {
    return logger.error("updateS3Info", e, { archiveId, query, traceId });
  }
};

export const initialScreenCaptureInfo = async (archiveId, link,file,fullPageLink,fullPageImage) => {
  const traceId = uuid();
  await refreshToken();
  const query = `
           mutation {
            initialScreenCaptureInfo(screenCaptureInput: {
            archiveId:${JSON.stringify(archiveId)},
            s3Link: ${JSON.stringify(link)},
            imageFile: ${file}
            fullPageLink: ${JSON.stringify(fullPageLink)},
            fullPageImage: ${fullPageImage}
           }) {_id}}
        `;

  try {
    let response = await fetch(PORT, {
      method: "post",
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({
        query,
      }),
    });
    return await response.json();
  } catch (err) {
    return logger.error("updateS3Info", err, { archiveId, link, query, traceId });
  }
};

export const reportS3Error = async (archiveId) => {
  const traceId = uuid();
  await refreshToken();
  const query = `
      mutation{
      reportS3Error(archiveId:${JSON.stringify(archiveId)})
     {status}}
`;

  try {
    let response = await fetch(PORT, {
      method: "post",
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({
        query,
      }),
    });
    return await response.json();
  } catch (err) {
    return logger.error("reportS3Error", err, { archiveId, query, traceId });
  }
};

export const cancelRecord = async (archiveId) => {
  const traceId = uuid();
  await refreshToken();
  const query = `
      mutation{
      cancelRecord(archiveId:${JSON.stringify(archiveId)})
     {status}}
`;

  try {
    let response = await fetch(PORT, {
      method: "post",
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({
        query,
      }),
    });
    return await response.json();
  } catch (err) {
    return logger.error("cancelRecord", err, { archiveId, query, traceId });
  }
};
