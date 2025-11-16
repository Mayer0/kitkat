import { useState } from "react";
import axios from "axios";

export default function Home() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await axios.post("/api/chat", { message });
    setResponse(res.data.reply);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>OpenAI ChatKit Starter</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something..."
          style={{ width: "300px" }}
        />
        <button type="submit">Send</button>
      </form>
      <p>{response}</p>
    </div>
  );
}

