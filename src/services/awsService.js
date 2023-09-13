import { AwsClient } from "aws4fetch";
import { logger } from "./logger";
import { v4 as uuid } from "uuid";

const aws = new AwsClient({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION,
});

const endPoint = `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/`;

export const uploadFileToS3 = async (file, s3Path, internal, signal) => {
  const traceId = uuid();
  if(internal == true){
    s3Path = "internal/" + s3Path;
  }else{
    s3Path = "external/" + s3Path;
  }
  try {
    const response = await aws.fetch(endPoint + s3Path, { body: new File([file], s3Path), method: "PUT", signal });
    if (response.status !== 200) {
      return logger.error("uploadFileToS3", response.statusText, { traceId });
    }
     
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      return logger.info("uploadFileToS3-aborted", error, { traceId });
    } else {
      return logger.error("uploadFileToS3", error, { traceId });
    }
  }
};

export const generateS3Path = async (type = "wacz") => {
  const user = await chrome.storage.local.get("user_id");
  let today = new Date();
  return `${user.user_id}/${today.toLocaleDateString().split(",")[0].replaceAll("/", "_")}/${today.toTimeString().split(" ")[0].replaceAll(":", "_")}.${type}`;
};
