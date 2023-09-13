import { Logtail } from "@logtail/browser";
const logtail = new Logtail(process.env.LOGTAIL_KEY);

function getCurrentUserId() {
  return chrome.storage.local.get("user_id");
}

async function enrichLogs(log) {
  return {
    ...log,
    userId: getCurrentUserId(),
  };
}

logtail.use(enrichLogs);

export const logger = {
  log(msg, obj) {
    logtail.log(msg, "log", obj);
    console.log(msg, obj);
  },
  info(msg, obj) {
    logtail.info(msg, obj);
    console.info(msg, obj);
    return { errors: [] };
  },
  warn(msg, obj) {
    logtail.warn(msg, obj);
    console.warn(msg, obj);
  },
  error(msg, err, obj) {
    if (Object.prototype.toString.call(err) === "[object Error]") {
      obj = obj || {};
      obj.errorMessage = err && err.toString();
      obj.stacktrace = err && err.stack && err.stack.toString();
    } else {
      obj = obj || {};
      obj.error = err;
    }
    logtail.error(msg, obj);
    console.error(msg, obj);
    return { errors: [{ message: msg, isException: true, ...(obj || {}) }] };
  },
};
