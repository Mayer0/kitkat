export default async function handler(req, res) {
  const { message } = req.body;

  // Replace with actual OpenAI API call in production
  res.status(200).json({ reply: `Echo: ${message}` });
}


