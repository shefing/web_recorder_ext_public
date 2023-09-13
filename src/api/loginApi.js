const PORT = process.env.ADMIN_URL + "/graphql";
import { logger } from "../services/logger";
import { v4 as uuid } from "uuid";

export const login = async (username, password) => {
  const traceId = uuid();
  const query = `
   mutation {login(user:{
   email:${JSON.stringify(username)},
   password:${JSON.stringify(password)}})
  {token user{_id email roles}}}
  `;
  try {
    let response = await fetch(PORT, {
      method: "post",
      headers: {
        "Content-type": "application/json",
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({
        query,
      }),
    });
    return await response.json();
  } catch (e) {
    return logger.error("login", e, { username, traceId });
  }
};

export const tokenValidation = async (token) => {
  const traceId = uuid();

  const query = `
query { user{email _id roles}}`;

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
    return logger.error("tokenValidation", e, { traceId });
  }
};
