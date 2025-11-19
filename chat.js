import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

// --- Configuration ---
// Note: NEXT_PUBLIC_MCP_ENDPOINT is read from .env.local
const MCP_ENDPOINT = process.env.NEXT_PUBLIC_MCP_ENDPOINT || 'http://localhost:8080/mcp';
const AGENT_ID = "security-sales-tool"; 

// --- Core Helper Functions ---

/**
 * Parses the agent's response to extract tool calls, general text, and grounding citations.
 * @param {object} message - The message object from the API response.
 * @returns {object} Structured parts of the message.
 */
const parseAgentResponse = (message) => {
  const parts = message?.content?.parts || [];
  let toolCalls = [];
  let text = '';
  let groundingSources = [];

  for (const part of parts) {
    if (part.functionCall) {
      toolCalls.push(part.functionCall);
    }
    if (part.text) {
      text += part.text;
    }
    if (part.groundingMetadata?.groundingAttributions) {
        groundingSources = groundingSources.concat(part.groundingMetadata.groundingAttributions.map(attr => ({
            uri: attr.web?.uri,
            title: attr.web?.title
        })));
    }
  }

  return { toolCalls, text, groundingSources };
};

/**
 * Function to call the Model Context Protocol (MCP) endpoint.
 * @param {Array<object>} history - The current chat history.
 * @param {Array<object>} toolOutputs - Outputs from tools run locally (if any).
 * @returns {Promise<object>} The agent's response.
 */
const callAgent = async (history, toolOutputs = []) => {
    try {
        const payload = {
            agentId: AGENT_ID,
            history: history,
            toolOutputs: toolOutputs,
        };

        const response = await axios.post(MCP_ENDPOINT, payload);
        return response.data;
    } catch (error) {
        console.error("Error calling agent:", error);
        return { error: 'Failed to connect to the agent service.' };
    }
};

// --- React Components ---

/**
 * Renders the system and user messages.
 */
const ChatMessage = ({ message, isAgent, isError, showLoading }) => {
    const { text, groundingSources } = parseAgentResponse(message);
    const isToolCall = message.toolCalls && message.toolCalls.length > 0;
    const isWidget = message.role === 'tool' && message.widget;

    // Open Evidence Styling
    const baseStyle = "p-3 rounded-lg max-w-4xl mx-auto mb-4 break-words shadow-sm";
    const agentStyle = "bg-gray-100 text-gray-800 rounded-bl-none ml-auto text-left";
    const userStyle = "bg-indigo-50 text-gray-800 rounded-br-none mr-auto text-left";
    const errorStyle = "bg-red-100 text-red-700";
    const loadingStyle = "bg-gray-100 text-gray-500 italic";

    if (isError) {
        return (
            <div className={`${baseStyle} ${agentStyle} ${errorStyle}`}>
                <p className="font-bold">Error:</p>
                <p>{message.error}</p>
            </div>
        );
    }
    
    if (isWidget) {
        return (
            <div className="flex justify-start">
                <div className="p-4 rounded-xl max-w-2xl w-full mx-auto my-4 bg-white border border-gray-200 shadow-xl">
                    <div dangerouslySetInnerHTML={{ __html: message.widget.html }} />
                    <p className="mt-4 text-xs text-gray-500">
                        Widget rendered by `generateOfferWidget` tool.
                    </p>
                </div>
            </div>
        );
    }

    // Default text or loading state
    return (
        <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
            <div className={`${baseStyle} ${isAgent ? agentStyle : userStyle} ${showLoading ? loadingStyle : ''}`}>
                <p>{showLoading ? 'Agent is thinking...' : text}</p>
                
                {groundingSources.length > 0 && (
                    <div className="mt-3 text-xs text-gray-500 border-t pt-2 border-gray-300">
                        <p className="font-semibold mb-1">Sources:</p>
                        <ul className="list-disc list-inside space-y-1">
                            {groundingSources.slice(0, 3).map((source, index) => (
                                <li key={index}>
                                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline">
                                        {source.title || 'Source Link'}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {isToolCall && <p className="mt-2 text-xs text-indigo-500 italic">...agent is executing a tool call.</p>}
            </div>
        </div>
    );
};

/**
 * Main application component.
 */
const App = () => {
    const [history, setHistory] = useState([
        { role: 'agent', content: { parts: [{ text: "Hello! How can I assist you today? Try asking about 'home' or 'business' security packages." }] } }
    ]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef(null);

    // Scroll to the latest message
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [history]);

    // Expose agentCall function globally for the widget button
    useEffect(() => {
        window.agentCall = (toolName, args) => handleSendMessage(null, toolName, args);
        return () => { delete window.agentCall; };
    }, [history, isThinking]); // Dependency array ensures it re-binds if state changes

    // Main send logic
    const handleSendMessage = useCallback(async (userText, toolName = null, toolArgs = {}) => {
        if (isThinking) return;

        let newHistory = [...history];
        let toolOutputs = [];
        let finalMessage = userText;

        setIsThinking(true);

        // 1. Handle User Input
        if (userText && userText.trim() !== '') {
            newHistory.push({ role: 'user', content: { parts: [{ text: userText }] } });
            setInput('');
        }
        
        // 2. Handle Widget Interaction (Tool Call)
        if (toolName) {
            finalMessage = `User clicked widget button: ${toolName}(${JSON.stringify(toolArgs)})`;
            // Add a virtual user message for the tool click
            newHistory.push({ role: 'user', content: { parts: [{ text: finalMessage }] } }); 

            // Execute the tool locally if needed (optional pattern, for simplicity we push the tool call to the model)
            // Or structure it as a tool output to the model for next turn
            toolOutputs = [
                {
                    toolName: toolName,
                    output: {
                        purchase_url: "Generating link..." 
                    }
                }
            ];
            // Since the model should be able to run the tool, we just let it handle the history update
        }


        // 3. Call the Agent
        try {
            const result = await callAgent(newHistory);

            if (result.error) {
                setHistory(h => [...h, { role: 'error', error: result.error }]);
                return;
            }
            
            const agentMessage = result.candidates[0].content;
            
            // Check for widget output (special handling for the generateOfferWidget tool)
            const parsedOutput = parseAgentResponse(agentMessage);
            let widget = null;
            
            // If the text is JSON that contains a widget_data key, extract it
            try {
                const data = JSON.parse(parsedOutput.text);
                if (data.widget_data) {
                    widget = data.widget_data;
                    agentMessage.text = 'Here are the recommended packages:'; // Override text for display
                }
            } catch (e) {
                // Not a widget JSON response, proceed as normal text
            }
            
            // Add agent response to history
            const agentHistoryEntry = { 
                role: 'agent', 
                content: agentMessage,
                ...(widget && { widget }) // Add widget flag if present
            };
            setHistory(h => [...h, agentHistoryEntry]);

        } catch (error) {
            setHistory(h => [...h, { role: 'error', error: 'An unexpected error occurred during communication.' }]);
        } finally {
            setIsThinking(false);
        }
    }, [history, isThinking]);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && input.trim() !== '' && !isThinking) {
            handleSendMessage(input);
        }
    };

    // --- Render Open Evidence Style UI ---
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col antialiased">
            {/* Header/Banner */}
            <header className="bg-white border-b border-gray-200 shadow-md py-4">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <h1 className="text-2xl font-extrabold text-indigo-700 tracking-tight">
                        Security Sales AI Agent 🛡️
                    </h1>
                    <span className="text-sm text-gray-500">Model Context Protocol Demo</span>
                </div>
            </header>

            {/* Chat Area - Main Content */}
            <main className="flex-grow overflow-y-auto pt-8 pb-32">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {history.map((message, index) => (
                        <ChatMessage 
                            key={index}
                            message={message.content}
                            isAgent={message.role === 'agent'}
                            isError={message.role === 'error'}
                            isWidget={!!message.widget}
                            showLoading={index === history.length - 1 && isThinking}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* Input Footer */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl p-4">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center space-x-4">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={isThinking ? "Waiting for response..." : "Ask about home or business packages..."}
                        disabled={isThinking}
                        className="flex-grow p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 transition-colors"
                    />
                    <button
                        onClick={() => handleSendMessage(input)}
                        disabled={!input.trim() || isThinking}
                        className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2
                            ${!input.trim() || isThinking 
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                            }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                        <span>Send</span>
                    </button>
                </div>
                <p className="mt-2 text-xs text-center text-gray-400">
                    Your environment is running on Node v{process.version}.
                </p>
            </footer>
        </div>
    );
};

export default App;
