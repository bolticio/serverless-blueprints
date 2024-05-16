// Define the handler function
export const handler = async (req, res) => {
  // Get the request headers
  const headers = req.headers;

  // Modify the headers
  headers["user-agent"] = "Boltic Serverless";

  // Return a response with modified headers
  res.status(200).send({ message: "Modified Headers", headers });
};
